// Supabase Edge Function — extract text from an uploaded library document,
// chunk it, embed each chunk via the kie.ai OpenAI-compatible /embeddings
// endpoint (key + base URL + model read from app_settings), and store the
// vectors in public.document_chunks for semantic retrieval.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import mammoth from "https://esm.sh/mammoth@1.8.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

// Embeddings via the Lovable AI Gateway (gemini-embedding-001 truncated to 1536).
const GATEWAY = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIM = 1536;
const TARGET_CHARS = 4000; // ~1000 tokens
const OVERLAP_CHARS = 480; // ~120 tokens
const MAX_PAGES = 600;
const EMBED_BATCH = 16;
const CHUNK_BUDGET_PER_INVOCATION = 200; // resume after this many chunks to dodge timeouts

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EmbedSettings = { apiKey: string; baseUrl: string; model: string };

async function loadEmbedSettings(supabase: any): Promise<EmbedSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", ["kie_ai_api_key", "kie_ai_base_url", "kie_ai_embedding_model"]);
  if (error) throw new Error("Không đọc được cấu hình kie.ai");
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    apiKey: map.kie_ai_api_key ?? "",
    baseUrl: map.kie_ai_base_url ?? "https://api.kie.ai/v1",
    model: map.kie_ai_embedding_model ?? "text-embedding-3-small",
  };
}

function chunkText(raw: string, title: string) {
  const text = raw.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: { content: string; token_estimate: number }[] = [];
  let buf = "";

  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed.length < 80) return;
    chunks.push({ content: trimmed, token_estimate: Math.ceil(trimmed.length / 4) });
  };

  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > TARGET_CHARS && buf.length > 0) {
      flush();
      const tail = buf.slice(Math.max(0, buf.length - OVERLAP_CHARS));
      buf = tail + "\n\n" + p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
    while (buf.length > TARGET_CHARS * 1.5) {
      const slice = buf.slice(0, TARGET_CHARS);
      chunks.push({ content: slice.trim(), token_estimate: Math.ceil(slice.length / 4) });
      buf = buf.slice(TARGET_CHARS - OVERLAP_CHARS);
    }
  }
  if (buf) flush();

  return chunks.map((c, i) => ({ ...c, chunk_index: i, source_title: title }));
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const resp = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
      dimensions: EMBED_DIM, // gemini-embedding-001 supports MRL truncation to 1536
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Lovable Gateway /embeddings ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json: any = await resp.json();
  if (!Array.isArray(json.data)) throw new Error("Phản hồi embedding không hợp lệ");
  const vectors = json.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding as number[]);
  // Validate dimension; if model returns a different dim, fail fast with a clear message
  if (vectors[0] && vectors[0].length !== EMBED_DIM) {
    throw new Error(
      `Embedding model "${s.model}" trả về ${vectors[0].length} chiều, hệ thống yêu cầu ${EMBED_DIM}. ` +
      `Vui lòng chọn model embedding 1536 chiều (ví dụ text-embedding-3-small) trong Cài đặt.`
    );
  }
  return vectors;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pageCount = pdf.numPages;
  if (pageCount > MAX_PAGES) {
    throw new Error(`Tệp quá lớn (${pageCount} trang). Vui lòng tách nhỏ dưới ${MAX_PAGES} trang.`);
  }
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : (text as string);
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  // mammoth expects an ArrayBuffer in Node mode
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const result = await mammoth.extractRawText({ arrayBuffer: buffer as ArrayBuffer });
  return result.value ?? "";
}

async function extractByType(bytes: Uint8Array, fileType: string | null, path: string): Promise<string> {
  const lowerPath = path.toLowerCase();
  if ((fileType && fileType.includes("pdf")) || lowerPath.endsWith(".pdf")) {
    return await extractPdfText(bytes);
  }
  if ((fileType && fileType.includes("officedocument.wordprocessingml")) || lowerPath.endsWith(".docx")) {
    return await extractDocxText(bytes);
  }
  if ((fileType && (fileType.startsWith("text/") || fileType.includes("markdown"))) ||
      lowerPath.endsWith(".txt") || lowerPath.endsWith(".md")) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  throw new Error("Định dạng tệp chưa hỗ trợ. Hiện chỉ nhận PDF, DOCX, TXT, MD.");
}

async function selfReinvoke(documentId: string, resumeFromChunk: number, authHeader: string | null) {
  // Best-effort fire-and-forget; the function URL is the same as the current request
  const url = `${SUPABASE_URL}/functions/v1/ingest-library-doc`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ document_id: documentId, resume_from_chunk: resumeFromChunk }),
    });
  } catch (e) {
    console.error("self-reinvoke failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let documentId: string | undefined;
  const startedAt = Date.now();
  const SOFT_TIME_BUDGET_MS = 120_000;

  try {
    const body = await req.json();
    documentId = body.document_id;
    const resumeFromChunk: number = Number.isInteger(body.resume_from_chunk) ? body.resume_from_chunk : 0;
    if (!documentId) throw new Error("Thiếu document_id");

    const { data: doc, error: docErr } = await supabase
      .from("library_documents")
      .select("id,title,storage_path,file_type")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Không tìm thấy tài liệu");

    // The Lovable Gateway key is auto-provisioned for edge functions; verify it.
    if (!LOVABLE_API_KEY) {
      await supabase
        .from("library_documents")
        .update({
          ingest_status: "failed",
          ingest_error: "Thiếu LOVABLE_API_KEY trên Lovable Cloud — không thể tạo embedding.",
        })
        .eq("id", documentId);
      return new Response(JSON.stringify({ ok: false, reason: "missing_key" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("library_documents")
      .update({ ingest_status: "processing", ingest_error: null })
      .eq("id", documentId);

    // On a fresh ingestion run (resume == 0), wipe existing chunks
    if (resumeFromChunk === 0) {
      await supabase.from("document_chunks").delete().eq("document_id", documentId);
    }

    const { data: file, error: dlErr } = await supabase.storage.from("library").download(doc.storage_path);
    if (dlErr || !file) throw new Error(`Không tải được tệp: ${dlErr?.message ?? "unknown"}`);
    const bytes = new Uint8Array(await file.arrayBuffer());

    const rawText = await extractByType(bytes, doc.file_type, doc.storage_path);
    const chunks = chunkText(rawText, doc.title);

    if (chunks.length === 0) {
      await supabase
        .from("library_documents")
        .update({
          ingest_status: "failed",
          ingest_error: "Không trích xuất được nội dung từ tệp này.",
          chunk_count: 0,
        })
        .eq("id", documentId);
      return new Response(JSON.stringify({ ok: false, reason: "no_content" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processedThisRun = 0;
    let nextChunkIndex = resumeFromChunk;

    for (let i = resumeFromChunk; i < chunks.length; i += EMBED_BATCH) {
      // Resume if running out of CPU budget or chunk count budget
      if (
        Date.now() - startedAt > SOFT_TIME_BUDGET_MS ||
        processedThisRun >= CHUNK_BUDGET_PER_INVOCATION
      ) {
        await selfReinvoke(documentId, nextChunkIndex, req.headers.get("Authorization"));
        return new Response(JSON.stringify({ ok: true, resumed_at: nextChunkIndex }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const batch = chunks.slice(i, i + EMBED_BATCH);
      const vectors = await embedBatch(batch.map((c) => c.content));
      const rows = batch.map((c, j) => ({
        document_id: documentId,
        chunk_index: c.chunk_index,
        source_title: c.source_title,
        content: c.content,
        token_estimate: c.token_estimate,
        embedding: vectors[j] as any,
      }));
      const { error: insErr } = await supabase.from("document_chunks").insert(rows);
      if (insErr) throw new Error(`Lỗi lưu chunk: ${insErr.message}`);
      processedThisRun += rows.length;
      nextChunkIndex = i + EMBED_BATCH;
    }

    // Done — count actual rows
    const { count } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);

    await supabase
      .from("library_documents")
      .update({
        ingest_status: "done",
        ingest_error: null,
        chunk_count: count ?? chunks.length,
        ingested_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return new Response(JSON.stringify({ ok: true, chunks: count ?? chunks.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ingest-library-doc error", e);
    if (documentId) {
      await supabase
        .from("library_documents")
        .update({
          ingest_status: "failed",
          ingest_error: String(e.message ?? e).slice(0, 500),
        })
        .eq("id", documentId);
    }
    return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
