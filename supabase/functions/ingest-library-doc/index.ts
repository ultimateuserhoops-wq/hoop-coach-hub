// Supabase Edge Function — extract text from an uploaded library document,
// chunk it, embed each chunk via the Lovable AI Gateway, and store the
// vectors in public.document_chunks for semantic retrieval.
//
// Triggered from the frontend after upload, or from the "Lập lại chỉ mục"
// button. Requires a signed-in user (verify_jwt defaults to true).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIM = 1536;

const TARGET_CHARS = 4000; // ~1000 tokens
const OVERLAP_CHARS = 480; // ~120 tokens
const MAX_PAGES = 600;
const EMBED_BATCH = 16;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function chunkText(raw: string, title: string) {
  // Normalize whitespace
  const text = raw.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  // Split on paragraph boundaries, then pack into ~TARGET_CHARS windows with overlap.
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
      // Start next buffer with tail overlap of previous content
      const tail = buf.slice(Math.max(0, buf.length - OVERLAP_CHARS));
      buf = tail + "\n\n" + p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
    // If a single paragraph is huge, hard-split
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
  const resp = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
      dimensions: EMBED_DIM,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Embedding API ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json: any = await resp.json();
  if (!Array.isArray(json.data)) throw new Error("Phản hồi embedding không hợp lệ");
  // Make sure they come back in input order
  return json.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding as number[]);
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

async function extractByType(bytes: Uint8Array, fileType: string | null, path: string): Promise<string> {
  const lowerPath = path.toLowerCase();
  if ((fileType && fileType.includes("pdf")) || lowerPath.endsWith(".pdf")) {
    return await extractPdfText(bytes);
  }
  if ((fileType && (fileType.startsWith("text/") || fileType.includes("markdown"))) ||
      lowerPath.endsWith(".txt") || lowerPath.endsWith(".md")) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  throw new Error("Định dạng tệp chưa hỗ trợ. Hiện chỉ nhận PDF, TXT, MD.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let documentId: string | undefined;

  try {
    const body = await req.json();
    documentId = body.document_id;
    if (!documentId) throw new Error("Thiếu document_id");

    const { data: doc, error: docErr } = await supabase
      .from("library_documents")
      .select("id,title,storage_path,file_type")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Không tìm thấy tài liệu");

    await supabase
      .from("library_documents")
      .update({ ingest_status: "processing", ingest_error: null })
      .eq("id", documentId);

    // Wipe any previous chunks (re-index path)
    await supabase.from("document_chunks").delete().eq("document_id", documentId);

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

    // Embed in batches, insert rolling
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const vectors = await embedBatch(batch.map((c) => c.content));
      const rows = batch.map((c, j) => ({
        document_id: documentId,
        chunk_index: c.chunk_index,
        source_title: c.source_title,
        content: c.content,
        token_estimate: c.token_estimate,
        embedding: vectors[j] as any, // pgvector accepts JSON array
      }));
      const { error: insErr } = await supabase.from("document_chunks").insert(rows);
      if (insErr) throw new Error(`Lỗi lưu chunk: ${insErr.message}`);
      inserted += rows.length;
    }

    await supabase
      .from("library_documents")
      .update({
        ingest_status: "done",
        ingest_error: null,
        chunk_count: inserted,
        ingested_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return new Response(JSON.stringify({ ok: true, chunks: inserted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ingest-library-doc error", e);
    if (documentId) {
      await supabase
        .from("library_documents")
        .update({ ingest_status: "failed", ingest_error: String(e.message ?? e).slice(0, 500) })
        .eq("id", documentId);
    }
    return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
