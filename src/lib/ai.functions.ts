import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GenSchema = z.object({
  type: z.enum(["curriculum", "tryout", "recommendation"]),
  target: z.string().min(1).max(120),
  extraContext: z.string().max(4000).optional(),
  studentId: z.string().uuid().optional(),
});

type Settings = { apiKey: string; baseUrl: string; model: string };

async function loadSettings(supabase: any): Promise<Settings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", ["kie_ai_api_key", "kie_ai_base_url", "kie_ai_model"]);
  if (error) throw new Error("Không đọc được cấu hình kie.ai");
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    apiKey: map.kie_ai_api_key ?? "",
    baseUrl: map.kie_ai_base_url ?? "https://api.kie.ai/v1",
    model: map.kie_ai_model ?? "opus-4.8",
  };
}

function buildPrompt(type: string, target: string, libRefs: string, extra?: string) {
  const lang = "Trả lời bằng tiếng Việt, dùng định dạng markdown rõ ràng, có tiêu đề, danh sách bài tập, thời lượng, mục tiêu kỹ thuật.";
  if (type === "curriculum") {
    return `Bạn là HLV bóng rổ chuyên nghiệp của BDC Basketball Centre. Hãy soạn GIÁO ÁN và KẾ HOẠCH TẬP LUYỆN chi tiết cho học viên trình độ "${target}". 
Bao gồm: mục tiêu khóa học (8 tuần), kỹ năng trọng tâm, bài tập mẫu theo buổi (khởi động → kỹ thuật → chiến thuật → thể lực → game), thang đánh giá tiến bộ.
${lang}
${libRefs}
${extra ? `\nGhi chú thêm từ HLV: ${extra}` : ""}`;
  }
  if (type === "tryout") {
    return `Bạn là HLV tuyển chọn lớp năng khiếu BDC. Hãy thiết kế PHƯƠNG ÁN TRY-OUT cho nhóm tuổi ${target}.
Bao gồm: tiêu chí đánh giá (kỹ thuật, thể lực, IQ bóng rổ, thái độ), 6-8 bài kiểm tra cụ thể có thang điểm, quy trình tổ chức buổi try-out (timeline), tiêu chí chọn vào lớp Elite.
${lang}
${libRefs}
${extra ? `\nGhi chú thêm từ HLV: ${extra}` : ""}`;
  }
  return `Bạn là HLV bóng rổ BDC. Dựa trên dữ liệu test của học viên dưới đây, hãy đưa ra GỢI Ý LỘ TRÌNH TẬP LUYỆN cá nhân hóa trong 4 tuần tới: ưu/khuyết điểm, bài tập cụ thể, KPI đo lường.
${lang}
${libRefs}
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

    // RAG-lite: pull library titles + descriptions as reference context
    const { data: lib } = await supabase
      .from("library_documents")
      .select("title,description")
      .order("created_at", { ascending: false })
      .limit(20);
    const libRefs = lib && lib.length
      ? `\n--- Tài liệu tham khảo từ thư viện BDC ---\n${lib.map((d: any) => `• ${d.title}${d.description ? ": " + d.description : ""}`).join("\n")}\n---`
      : "";

    const prompt = buildPrompt(data.type, data.target, libRefs, data.extraContext);

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
      generation_type: data.type,
      target_label: data.target,
      prompt,
      response: aiText,
      student_id: data.studentId ?? null,
    });

    return { content: aiText };
  });
