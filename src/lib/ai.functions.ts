import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GenSchema = z.object({
  type: z.enum(["curriculum", "tryout", "recommendation", "research"]),
  target: z.string().min(1).max(120),
  extraContext: z.string().max(4000).optional(),
  studentId: z.string().uuid().optional(),
  selectedSourceTitles: z.array(z.string().max(300)).max(200).optional(),
  useWebResearch: z.boolean().optional(),
  testName: z.string().max(200).optional(),
  level: z.string().max(60).optional(),
});

type Settings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  embeddingModel: string;
};

const EMBED_DIM = 1536;
const RETRIEVAL_TOP_K = 6;
const RETRIEVAL_THRESHOLD = 0.2;
const CONTEXT_CHAR_BUDGET = 14000; // ~3500 tokens

async function loadSettings(supabase: any): Promise<Settings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", [
      "kie_ai_api_key",
      "kie_ai_base_url",
      "kie_ai_model",
      "kie_ai_embedding_model",
    ]);
  if (error) throw new Error("Không đọc được cấu hình kie.ai");
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    apiKey: map.kie_ai_api_key ?? "",
    baseUrl: map.kie_ai_base_url ?? "https://api.kie.ai/v1",
    model: map.kie_ai_model ?? "opus-4.8",
    embeddingModel: map.kie_ai_embedding_model ?? "text-embedding-3-small",
  };
}

async function embedQuery(text: string, s: Settings): Promise<number[] | null> {
  if (!s.apiKey || s.apiKey === "PLACEHOLDER_REPLACE_ME") return null;
  try {
    const url = `${s.baseUrl.replace(/\/$/, "")}/embeddings`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.apiKey}`,
      },
      body: JSON.stringify({
        model: s.embeddingModel,
        input: text,
        dimensions: EMBED_DIM,
      }),
    });
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const v = json?.data?.[0]?.embedding;
    if (!Array.isArray(v) || v.length !== EMBED_DIM) return null;
    return v;
  } catch {
    return null;
  }
}

async function titleFallback(supabase: any): Promise<string> {
  const { data: lib } = await supabase
    .from("library_documents")
    .select("title,description")
    .order("created_at", { ascending: false })
    .limit(20);
  if (!lib || lib.length === 0) return "";
  return `\n--- Tài liệu tham khảo (tiêu đề) ---\n${lib
    .map((d: any) => `• ${d.title}${d.description ? ": " + d.description : ""}`)
    .join("\n")}\n---`;
}

async function retrieveContext(supabase: any, query: string, s: Settings): Promise<string> {
  const embedding = await embedQuery(query, s);
  if (!embedding) return await titleFallback(supabase);

  const { data: hits, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedding as any,
    match_count: RETRIEVAL_TOP_K,
    similarity_threshold: RETRIEVAL_THRESHOLD,
  });

  if (error || !hits || hits.length === 0) return await titleFallback(supabase);

  let used = 0;
  const parts: string[] = [];
  for (const h of hits) {
    const block = `[Nguồn: ${h.source_title}]\n${h.content}`;
    if (used + block.length > CONTEXT_CHAR_BUDGET) {
      const remaining = CONTEXT_CHAR_BUDGET - used;
      if (remaining > 400) parts.push(block.slice(0, remaining) + "…");
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return `\n--- Trích đoạn tài liệu BDC (tìm theo ngữ nghĩa) ---\n${parts.join("\n\n")}\n---`;
}

function buildRetrievalQuery(type: string, target: string, extra?: string, level?: string) {
  if (type === "curriculum") {
    return `Giáo án và kế hoạch tập luyện bóng rổ cho học viên trình độ ${target}. ${extra ?? ""}`;
  }
  if (type === "tryout") {
    return `Phương án try-out tuyển chọn lớp năng khiếu bóng rổ cho nhóm tuổi ${target}. Bài kiểm tra kỹ thuật, thể lực, IQ bóng rổ. ${extra ?? ""}`;
  }
  if (type === "research") {
    return `Bài kiểm tra đánh giá bóng rổ cho nhóm tuổi ${target}${level ? `, trình độ ${level}` : ""}. Bài test kỹ thuật, thể lực, chiến thuật. ${extra ?? ""}`;
  }
  return `Lộ trình tập luyện cá nhân hóa cho học viên bóng rổ ${target}. ${extra ?? ""}`;
}

type PromptOpts = {
  selectedSourceTitles?: string[];
  useWebResearch?: boolean;
  testName?: string;
  level?: string;
};

function buildPrompt(type: string, target: string, libRefs: string, extra?: string, opts: PromptOpts = {}) {
  const lang = "Trả lời bằng tiếng Việt, dùng định dạng markdown rõ ràng, có tiêu đề, danh sách bài tập, thời lượng, mục tiêu kỹ thuật.";
  const sourcesBlock = opts.selectedSourceTitles && opts.selectedSourceTitles.length > 0
    ? `\n--- Nguồn tài liệu HLV đã chọn để tham khảo ---\n${opts.selectedSourceTitles.map((t) => `• ${t}`).join("\n")}\n---`
    : "";
  const webBlock = opts.useWebResearch
    ? "\n\nNGOÀI tài liệu trên, hãy kết hợp kiến thức cập nhật nhất về khoa học thể thao và phương pháp huấn luyện bóng rổ hiện đại từ kiến thức của bạn để bổ sung. Ghi chú rõ phần nào lấy từ tài liệu, phần nào từ kiến thức bổ sung."
    : "";

  if (type === "curriculum") {
    return `Bạn là HLV bóng rổ chuyên nghiệp của BDC Basketball Centre. Hãy soạn GIÁO ÁN và KẾ HOẠCH TẬP LUYỆN chi tiết cho học viên trình độ "${target}".
Bao gồm: mục tiêu khóa học (8 tuần), kỹ năng trọng tâm, bài tập mẫu theo buổi (khởi động → kỹ thuật → chiến thuật → thể lực → game), thang đánh giá tiến bộ.
${lang}
${libRefs}${sourcesBlock}${webBlock}
${extra ? `\nGhi chú thêm từ HLV: ${extra}` : ""}`;
  }
  if (type === "tryout") {
    return `Bạn là HLV tuyển chọn lớp năng khiếu BDC. Hãy thiết kế PHƯƠNG ÁN TRY-OUT cho nhóm tuổi ${target}.
Bao gồm: tiêu chí đánh giá (kỹ thuật, thể lực, IQ bóng rổ, thái độ), 6-8 bài kiểm tra cụ thể có thang điểm, quy trình tổ chức buổi try-out (timeline), tiêu chí chọn vào lớp Elite.
${lang}
${libRefs}${sourcesBlock}${webBlock}
${extra ? `\nGhi chú thêm từ HLV: ${extra}` : ""}`;
  }
  if (type === "research") {
    const nameLine = opts.testName ? `Tên bài kiểm tra do HLV đặt: "${opts.testName}".` : `Hãy tự đặt một cái tên gọn cho bài kiểm tra.`;
    return `Bạn là chuyên gia khoa học thể thao tại BDC Basketball Centre. Hãy thiết kế MỘT BÀI KIỂM TRA (TEST) đánh giá năng lực bóng rổ cho nhóm tuổi ${target}, trình độ ${opts.level ?? "không xác định"}.
${nameLine}
Bao gồm: mục tiêu bài test, danh sách 6–10 bài đo cụ thể (kỹ thuật, thể lực, chiến thuật, IQ), cách chấm điểm/thang điểm rõ ràng, dụng cụ cần chuẩn bị, timeline buổi test, cách giải thích kết quả cho phụ huynh.
${lang}
${libRefs}${sourcesBlock}${webBlock}
${extra ? `\nGhi chú thêm từ HLV: ${extra}` : ""}`;
  }
  return `Bạn là HLV bóng rổ BDC. Dựa trên dữ liệu test của học viên dưới đây, hãy đưa ra GỢI Ý LỘ TRÌNH TẬP LUYỆN cá nhân hóa trong 4 tuần tới: ưu/khuyết điểm, bài tập cụ thể, KPI đo lường.
${lang}
${libRefs}${sourcesBlock}${webBlock}
Dữ liệu học viên ${target}:
${extra ?? ""}`;
}

export const generateWithKieAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const settings = await loadSettings(supabase);
    if (!settings.apiKey || settings.apiKey === "PLACEHOLDER_REPLACE_ME") {
      throw new Error("API key của kie.ai chưa được cấu hình. Vui lòng vào trang Cài đặt (Admin) để nhập API key thật.");
    }

    const retrievalQuery = buildRetrievalQuery(data.type, data.target, data.extraContext, data.level);
    const libRefs = await retrieveContext(supabase, retrievalQuery, settings);

    const prompt = buildPrompt(data.type, data.target, libRefs, data.extraContext, {
      selectedSourceTitles: data.selectedSourceTitles,
      useWebResearch: data.useWebResearch,
      testName: data.testName,
      level: data.level,
    });

    const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
    let aiText = "";
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: "system", content: "Bạn là trợ lý chuyên môn cho HLV bóng rổ tại BDC Basketball Centre. Trả lời chuyên nghiệp, có cấu trúc, dùng tiếng Việt." },
            { role: "user", content: prompt },
          ],
          temperature: 0.6,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`kie.ai trả lỗi ${resp.status}: ${errText.slice(0, 200)}`);
      }
      const json: any = await resp.json();
      aiText = json?.choices?.[0]?.message?.content
            ?? json?.choices?.[0]?.text
            ?? json?.data?.content
            ?? JSON.stringify(json).slice(0, 2000);
    } catch (e: any) {
      throw new Error(`Không gọi được kie.ai: ${e.message}`);
    }

    await supabase.from("ai_generations").insert({
      coach_id: userId,
      generation_type: (data.type === "research" ? "tryout" : data.type) as any,
      target_label: data.target,
      prompt,
      response: aiText,
      student_id: data.studentId ?? null,
    });

    return { content: aiText };
  });
