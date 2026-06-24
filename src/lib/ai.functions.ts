import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GenSchema = z.object({
  type: z.enum(["curriculum", "tryout", "recommendation", "strength", "hybrid"]),
  target: z.string().min(1).max(120),
  extraContext: z.string().max(4000).optional(),
  studentId: z.string().uuid().optional(),
  weeks: z.number().int().min(1).max(24).optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  // How many AI calls to split the per-session plans into (to reduce load on
  // the kie.ai gateway). Omit = auto (~6 sessions per call).
  parts: z.number().int().min(1).max(8).optional(),
  // Tryout extras
  level: z.string().max(60).optional(),
  numStudents: z.number().int().min(1).max(200).optional(),
  durationMins: z.number().int().min(15).max(600).optional(),
  focus: z.array(z.string().max(40)).max(8).optional(),
  // Hybrid mix (percent basketball vs strength & conditioning)
  pctBasketball: z.number().int().min(0).max(100).optional(),
  pctStrength: z.number().int().min(0).max(100).optional(),
});

type Settings = {
  provider: string; // "kie" | "anthropic"
  apiKey: string;
  baseUrl: string;
  model: string;
  embeddingModel: string;
  anthropicKey: string;
  anthropicModel: string;
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
      "ai_provider",
      "kie_ai_api_key",
      "kie_ai_base_url",
      "kie_ai_model",
      "kie_ai_embedding_model",
      "anthropic_api_key",
      "anthropic_model",
    ]);
  if (error) throw new Error("Không đọc được cấu hình AI");
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    provider: map.ai_provider === "anthropic" ? "anthropic" : "kie",
    apiKey: map.kie_ai_api_key ?? "",
    baseUrl: map.kie_ai_base_url ?? "https://api.kie.ai",
    model: map.kie_ai_model ?? "claude-opus-4-8",
    embeddingModel: map.kie_ai_embedding_model ?? "text-embedding-3-small",
    anthropicKey: map.anthropic_api_key ?? "",
    anthropicModel: map.anthropic_model ?? "claude-opus-4-8",
  };
}

// Query embedding runs through the `embed-query` edge function (which holds the
// Lovable Gateway key), so it matches how chunks were embedded at ingestion.
async function embedQuery(text: string, supabase: any): Promise<number[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke("embed-query", { body: { text } });
    if (error) return null;
    const v = data?.embedding;
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
    .limit(40);
  if (!lib || lib.length === 0) return "";
  return `\n--- Tài liệu tham khảo (tiêu đề) ---\n${lib
    .map((d: any) => `• ${d.title}${d.description ? ": " + d.description : ""}`)
    .join("\n")}\n---`;
}

async function retrieveContext(supabase: any, query: string, _s: Settings): Promise<string> {
  const embedding = await embedQuery(query, supabase);
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

function buildRetrievalQuery(type: string, target: string, extra?: string) {
  if (type === "curriculum") {
    return `Giáo án và kế hoạch tập luyện bóng rổ cho học viên trình độ ${target}. ${extra ?? ""}`;
  }
  if (type === "tryout") {
    return `Phương án try-out tuyển chọn lớp năng khiếu bóng rổ cho nhóm tuổi ${target}. Bài kiểm tra kỹ thuật, thể lực, ném rổ, IQ bóng rổ, tâm lý thi đấu. ${extra ?? ""}`;
  }
  if (type === "strength") {
    return `Thể lực và sức mạnh cho bóng rổ: sức mạnh, sức bật, tốc độ, nhanh nhẹn, sức bền, phòng tránh chấn thương, chu kỳ hóa cho trình độ ${target}. ${extra ?? ""}`;
  }
  if (type === "hybrid") {
    return `Chương trình kết hợp bóng rổ và thể lực sức mạnh cho trình độ ${target}: kỹ thuật, chiến thuật, S&C, chu kỳ hóa. ${extra ?? ""}`;
  }
  return `Lộ trình tập luyện cá nhân hóa cho học viên bóng rổ ${target}. ${extra ?? ""}`;
}

const STYLE_RULES = `QUY TẮC TRÌNH BÀY:
- Trả lời HOÀN TOÀN bằng tiếng Việt, dùng markdown chuyên nghiệp (tiêu đề #, ##, ###; in đậm; danh sách; và BẢNG khi phù hợp).
- Viết chi tiết, cụ thể, có số liệu (thời lượng từng phần, số lần/hiệp/set, số học viên, kích thước sân) — KHÔNG viết chung chung.
- Mỗi bài tập phải ghi: tên bài, mục đích, cách thực hiện, khối lượng (số lần/phút), điểm kỹ thuật cần sửa.`;

function buildPrompt(data: any, libRefs: string) {
  const target = data.target;
  const extra = data.extraContext;
  const note = extra ? `\nGHI CHÚ / YÊU CẦU RIÊNG TỪ HLV (ưu tiên tuân theo): ${extra}` : "";

  if (data.type === "tryout") {
    const lvl = data.level ? `, trình độ ${data.level}` : "";
    const n = data.numStudents ? `${data.numStudents} ứng viên` : "số ứng viên linh hoạt";
    const dur = data.durationMins ? `${data.durationMins} phút` : "thời lượng linh hoạt";
    const focusList = data.focus && data.focus.length ? data.focus.join(", ") : "thể chất, kỹ năng, ném rổ, tâm lý";
    return `Bạn là HLV tuyển chọn lớp năng khiếu (Elite) tại BDC Basketball Centre. Hãy thiết kế PHƯƠNG ÁN TRY-OUT HOÀN CHỈNH, CHI TIẾT.

THÔNG SỐ ĐỢT TUYỂN CHỌN:
- Nhóm tuổi: ${target}${lvl}.
- Quy mô: ${n}.
- Thời lượng mỗi buổi try-out: ${dur}.
- TRỌNG TÂM đánh giá (ưu tiên cao — phân bổ nhiều thời gian & trọng số hơn): ${focusList}.

QUAN TRỌNG: KẾT HỢP kiến thức từ TRÍCH ĐOẠN TÀI LIỆU BDC ở dưới (thư viện sách HLV) với phương pháp tuyển chọn có cơ sở khoa học để chọn bài test chuẩn, phù hợp lứa tuổi ${target}. Khi một bài test/ý tưởng dựa trên tài liệu, hãy ghi rõ "(theo: <tên tài liệu>)".

Bài làm BẮT BUỘC có đủ:

## A. MỤC TIÊU & TRIẾT LÝ TUYỂN CHỌN
- Chân dung học viên Elite cần tìm; vì sao nhấn mạnh ${focusList}.

## B. KHUNG TIÊU CHÍ & TRỌNG SỐ
BẢNG: | Nhóm tiêu chí | Nội dung đánh giá | Trọng số (%) |. Tăng trọng số cho các trọng tâm đã chọn (${focusList}). Tổng = 100%.

## C. CÁC TRẠM/BÀI KIỂM TRA
Đủ trạm cho ${n}, bám sát trọng tâm. MỖI bài: mục đích, cách thực hiện, dụng cụ, THANG ĐIỂM cụ thể (mốc theo số liệu/thời gian theo chuẩn lứa tuổi ${target}), nguồn tham khảo nếu từ tài liệu BDC.

## D. KỊCH BẢN TỔ CHỨC (Timeline ${dur})
BẢNG thời gian từng mốc khớp thời lượng ${dur} và quy mô ${n}; bố trí nhân sự/sân/luân chuyển nhóm.

## E. PHIẾU CHẤM ĐIỂM & TỔNG HỢP
Mẫu phiếu chấm (bảng) + công thức tính điểm tổng theo trọng số, ngưỡng ĐẠT vào lớp Elite.

## F. BƯỚC TIẾP THEO
- Thông báo kết quả; lộ trình cho ứng viên ĐẠT và chưa đạt.

${STYLE_RULES}
${libRefs}${note}`;
  }

  if (data.type === "strength") {
    const wk = data.weeks ?? 8;
    const spw = data.sessionsPerWeek ?? 3;
    return `Bạn là chuyên gia Thể lực & Sức mạnh (Strength & Conditioning) cho bóng rổ tại BDC Basketball Centre. Hãy soạn CHƯƠNG TRÌNH S&C HOÀN CHỈNH, CHI TIẾT cho trình độ "${target}".

THÔNG SỐ: ${wk} tuần, ${spw} buổi S&C/tuần (điều chỉnh theo ghi chú nếu có). PHẢI an toàn theo lứa tuổi/trình độ — ưu tiên kỹ thuật đúng trước khi tăng tải.

Bài làm BẮT BUỘC có đủ:

## A. TỔNG QUAN & TRIẾT LÝ
- Mục tiêu thể lực cho bóng rổ (sức mạnh, sức bật, tốc độ, nhanh nhẹn, sức bền, phòng tránh chấn thương).
- Nguyên tắc an toàn & phù hợp lứa tuổi/trình độ.

## B. ĐÁNH GIÁ ĐẦU VÀO (Testing)
BẢNG bài test thể lực (VD: bật cao, sprint 20m, agility T-test, sức mạnh tương đối, sức bền) + chuẩn tham chiếu.

## C. CHU KỲ HÓA (Periodization)
BẢNG ${wk} tuần theo các pha (ổn định/giải phẫu → sức mạnh nền → sức mạnh–tốc độ/power → chuyển hóa/duy trì) — mỗi pha: trọng tâm, khối lượng/cường độ.

## D. GIÁO ÁN BUỔI MẪU (theo từng pha)
Mỗi pha một buổi mẫu: khởi động động → phần chính (BẢNG: bài tập | hiệp x lần | tải/cường độ | nghỉ | tempo) → bổ trợ core/phòng chấn thương → hạ nhiệt. Ghi số liệu cụ thể.

## E. PHỤC HỒI & DINH DƯỠNG
- Ngủ, giãn cơ, quản lý tải; gợi ý dinh dưỡng cơ bản quanh buổi tập.

## F. TÁI KIỂM TRA & TIẾN TRIỂN
- Lịch test lại; cách tăng tải an toàn; tiêu chí chuyển pha.

QUAN TRỌNG: tham khảo TRÍCH ĐOẠN TÀI LIỆU BDC bên dưới khi phù hợp.

${STYLE_RULES}
${libRefs}${note}`;
  }

  if (data.type === "hybrid") {
    const wk = data.weeks ?? 8;
    const spw = data.sessionsPerWeek ?? 3;
    let pb = data.pctBasketball ?? 60;
    let ps = data.pctStrength ?? 40;
    const sum = pb + ps;
    if (sum > 0 && sum !== 100) { pb = Math.round((pb / sum) * 100); ps = 100 - pb; }
    return `Bạn là Giám đốc chuyên môn tại BDC Basketball Centre. Hãy soạn CHƯƠNG TRÌNH KẾT HỢP (HYBRID) cho trình độ "${target}", tích hợp BÓNG RỔ và THỂ LỰC (S&C) theo tỉ lệ: BÓNG RỔ ${pb}% — S&C ${ps}%.

THÔNG SỐ: ${wk} tuần, ${spw} buổi/tuần. Phân bổ thời lượng & nội dung MỖI buổi và MỖI tuần ĐÚNG theo tỉ lệ ${pb}/${ps}.

Bài làm BẮT BUỘC có đủ:

## A. TRIẾT LÝ TÍCH HỢP
- Cách phối hợp bóng rổ ${pb}% và S&C ${ps}% để bổ trợ lẫn nhau, tránh quá tải.

## B. PHÂN BỔ THEO TỈ LỆ
BẢNG: phân bổ thời lượng/buổi và trọng tâm theo tỉ lệ ${pb}/${ps} (số phút bóng rổ vs số phút S&C mỗi buổi).

## C. CHU KỲ HÓA ${wk} TUẦN
BẢNG từng tuần: trọng tâm bóng rổ + trọng tâm S&C + tỉ lệ tuần đó (có thể dao động quanh ${pb}/${ps} theo pha).

## D. BUỔI TẬP MẪU TÍCH HỢP
2–3 buổi mẫu thể hiện rõ chia thời gian theo tỉ lệ: khối bóng rổ (kỹ thuật/chiến thuật/game) + khối S&C (sức mạnh/power/agility) + khởi động & hạ nhiệt chung. BẢNG bài tập có khối lượng.

## E. KIỂM TRA & ĐÁNH GIÁ
- Test cả kỹ năng bóng rổ và thể lực; lịch test; ngưỡng tiến bộ.

## F. AN TOÀN & PHỤC HỒI
- Quản lý tải khi gộp 2 mảng; phòng chấn thương.

QUAN TRỌNG: tham khảo TRÍCH ĐOẠN TÀI LIỆU BDC bên dưới khi phù hợp.

${STYLE_RULES}
${libRefs}${note}`;
  }

  return `Bạn là HLV bóng rổ tại BDC Basketball Centre. Dựa trên DỮ LIỆU TEST của học viên dưới đây, hãy đưa ra BẢN PHÂN TÍCH & LỘ TRÌNH TẬP LUYỆN CÁ NHÂN HÓA chi tiết.

Bài làm BẮT BUỘC có đủ:

## A. PHÂN TÍCH HIỆN TRẠNG
- Điểm mạnh, điểm yếu theo từng kỹ năng dựa trên số liệu test (so sánh xu hướng tiến bộ nếu có nhiều lần test).

## B. MỤC TIÊU 4 TUẦN TỚI (SMART)
BẢNG: | Kỹ năng cần cải thiện | Chỉ số hiện tại | Mục tiêu | Cách đạt |.

## C. LỘ TRÌNH CHI TIẾT THEO TỪNG TUẦN (Tuần 1 → 4)
Mỗi tuần ghi rõ trọng tâm + bài tập cụ thể (khối lượng) + ghi chú.

## D. CHECKPOINT & ĐÁNH GIÁ
- Mốc kiểm tra giữa kỳ (cuối tuần 2) và cuối kỳ (cuối tuần 4): test lại chỉ số gì, ngưỡng đạt.

## E. KHUYẾN NGHỊ CHO PHỤ HUYNH
- 2–3 việc phụ huynh hỗ trợ tại nhà.

${STYLE_RULES}
${libRefs}
DỮ LIỆU HỌC VIÊN (${target}):
${extra ?? ""}`;
}

// kie.ai serves Claude via the Anthropic Messages API at /claude/v1/messages,
// not OpenAI's /chat/completions. Normalize whatever base URL is stored
// (e.g. https://api.kie.ai, .../v1, .../claude/v1) down to the host.
function kieMessagesUrl(baseUrl: string) {
  const host = baseUrl.replace(/\/+$/, "").replace(/\/(claude\/v1|v1)$/, "");
  return `${host}/claude/v1/messages`;
}

// Map the legacy/placeholder model name to kie.ai's actual Opus 4.8 id.
function normalizeModel(m: string) {
  const t = (m || "").trim();
  if (!t || /^opus[-.]?4[-.]?8$/i.test(t)) return "claude-opus-4-8";
  return t;
}

// One AI chat call (Anthropic Messages shape), with retry on transient 5xx/429.
// Supports two providers, chosen in Settings:
//   - "anthropic": api.anthropic.com (x-api-key + anthropic-version), up to ~16k
//     output, NO temperature (Opus 4.8 rejects it with a 400).
//   - "kie": kie.ai gateway (Authorization: Bearer), output capped at 8192.
async function callAi(
  settings: Settings,
  systemPrompt: string,
  userContent: string,
  maxTokens = 8192,
): Promise<string> {
  const isAnthropic = settings.provider === "anthropic";
  const providerName = isAnthropic ? "Anthropic" : "kie.ai";
  const cap = isAnthropic ? 16000 : 8192;
  const url = isAnthropic
    ? "https://api.anthropic.com/v1/messages"
    : kieMessagesUrl(settings.baseUrl);
  const headers: Record<string, string> = isAnthropic
    ? {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicKey,
        "anthropic-version": "2023-06-01",
      }
    : {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      };
  const payload: any = {
    model: isAnthropic ? (settings.anthropicModel || "claude-opus-4-8") : normalizeModel(settings.model),
    max_tokens: Math.min(maxTokens, cap),
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    stream: false,
  };
  if (!isAnthropic) payload.temperature = 0.6; // kie tolerates; Anthropic Opus 4.8 rejects it
  const body = JSON.stringify(payload);

  const MAX_ATTEMPTS = 3;
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let lastErr = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, { method: "POST", headers, body });
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
      if (attempt >= MAX_ATTEMPTS) throw new Error(`Không gọi được ${providerName} (đã thử ${MAX_ATTEMPTS} lần): ${lastErr}`);
      await delay(attempt * 2000);
      continue;
    }

    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 200);
      if ((resp.status >= 500 || resp.status === 429) && attempt < MAX_ATTEMPTS) {
        lastErr = `${providerName} ${resp.status}: ${errText}`;
        await delay(attempt * 2500);
        continue;
      }
      throw new Error(`${providerName} trả lỗi ${resp.status}: ${errText}`);
    }

    const json: any = await resp.json();
    let text = "";
    if (Array.isArray(json?.content)) {
      text = json.content
        .filter((b: any) => b?.type === "text" && typeof b.text === "string")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
    }
    if (!text) text = json?.content?.[0]?.text ?? json?.choices?.[0]?.message?.content ?? "";
    if (!text) {
      lastErr = "không có nội dung trả về";
      if (attempt < MAX_ATTEMPTS) {
        await delay(attempt * 2000);
        continue;
      }
      throw new Error(`AI không trả về nội dung (${providerName})`);
    }
    return text;
  }
  throw new Error(`Không gọi được ${providerName}: ${lastErr || "lỗi không xác định"}`);
}

// Curriculum is generated in chunks (kie.ai's ~8192-token cap). Call 1 builds
// the framework (all parts EXCEPT the per-session plans).
function buildCurriculumDesignPrompt(
  target: string,
  weeks: number,
  spw: number,
  total: number,
  libRefs: string,
  extra?: string,
) {
  const note = extra ? `\nGHI CHÚ / YÊU CẦU RIÊNG TỪ HLV (ưu tiên tuân theo): ${extra}` : "";
  return `Bạn là HLV TRƯỞNG bóng rổ chuyên nghiệp tại BDC Basketball Centre. Hãy soạn PHẦN KHUNG của một CHƯƠNG TRÌNH HUẤN LUYỆN cho học viên trình độ "${target}".

THÔNG SỐ KHÓA: ${weeks} tuần, ${spw} buổi/tuần, TỔNG ${total} buổi, mỗi buổi 90 phút (trừ khi ghi chú HLV nêu khác).

Soạn ĐẦY ĐỦ các phần A, B, C, E, F dưới đây. KHÔNG soạn phần D (giáo án chi tiết từng buổi) — phần đó sẽ được soạn riêng ở bước sau.

## A. TỔNG QUAN CHƯƠNG TRÌNH
- Mục tiêu tổng thể (objective).
- Triết lý & phương pháp huấn luyện — cách thức/lộ trình để đạt mục tiêu.
- Chân dung đầu vào và đầu ra của học viên.

## B. MỤC TIÊU CỤ THỂ (SMART)
BẢNG: | Nhóm kỹ năng | Mục tiêu đo lường được | Chỉ số đạt (KPI) | Cách đạt được |. Bao quát kiểm soát bóng, chuyền, ném rổ, phòng thủ, chiến thuật, thể lực, tâm lý.

## C. LỘ TRÌNH ${weeks} TUẦN (Periodization)
BẢNG từng tuần: | Tuần | Trọng tâm | Kỹ năng chính | Kiểm tra/Cột mốc |. Độ khó tăng dần, ghi rõ tuần nào có buổi KIỂM TRA định kỳ.

## E. KIỂM TRA & ĐÁNH GIÁ ĐỊNH KỲ
- Bài test ĐẦU KHÓA (baseline) và CUỐI KHÓA (final) + tiêu chí đạt.
- Lịch kiểm tra nhỏ định kỳ (gợi ý mỗi 2 tuần): buổi số mấy, test gì, thang điểm.
- Mẫu PHIẾU ĐÁNH GIÁ học viên (bảng: tiêu chí — thang điểm — ghi chú).

## F. BƯỚC TIẾP THEO
- Tiêu chí lên trình độ kế tiếp + đề xuất khóa học tiếp theo.

${STYLE_RULES}
${libRefs}${note}`;
}

// Call 2+ : the detailed per-session plans for sessions [start..end] only.
function buildSessionBatchPrompt(
  target: string,
  total: number,
  start: number,
  end: number,
  design: string,
  libRefs: string,
  extra?: string,
) {
  const note = extra ? `\nGHI CHÚ RIÊNG TỪ HLV (ưu tiên tuân theo): ${extra}` : "";
  return `Bạn là HLV bóng rổ tại BDC Basketball Centre. Dưới đây là KHUNG CHƯƠNG TRÌNH đã duyệt cho trình độ "${target}" (tổng ${total} buổi):
"""
${design}
"""

Dựa CHÍNH XÁC theo "LỘ TRÌNH THEO TUẦN" ở khung trên, hãy soạn GIÁO ÁN CHI TIẾT cho CÁC BUỔI TỪ ${start} ĐẾN ${end} (chỉ các buổi này, KHÔNG soạn lại phần khung, KHÔNG soạn buổi ngoài khoảng này).

Mỗi buổi đánh số tiêu đề "### Buổi X" và gồm đủ:
- Mục tiêu buổi.
- Khởi động (số phút + nội dung).
- Kỹ thuật trọng tâm (bài tập cụ thể + khối lượng số lần/hiệp + điểm kỹ thuật cần sửa).
- Chiến thuật / phối hợp.
- Thể lực.
- Trò chơi / ứng dụng thi đấu.
- Thả lỏng & nhận xét.
- Dụng cụ cần chuẩn bị.

Nếu theo lộ trình có buổi KIỂM TRA định kỳ rơi vào khoảng ${start}–${end}, hãy soạn buổi đó dưới dạng buổi kiểm tra (bài test cụ thể + thang điểm).

${STYLE_RULES}
${libRefs}${note}`;
}

// Detailed sessions for ONE specific week, aligned to the approved framework.
function buildWeekPrompt(
  target: string,
  total: number,
  weekNo: number,
  spw: number,
  design: string,
  libRefs: string,
  extra?: string,
) {
  const start = (weekNo - 1) * spw + 1;
  const end = Math.min(weekNo * spw, total);
  const note = extra ? `\nGHI CHÚ RIÊNG TỪ HLV (ưu tiên tuân theo): ${extra}` : "";
  return `Bạn là HLV bóng rổ tại BDC Basketball Centre. Dưới đây là KHUNG CHƯƠNG TRÌNH đã duyệt cho trình độ "${target}" (tổng ${total} buổi):
"""
${design}
"""

Dựa CHÍNH XÁC theo trọng tâm của TUẦN ${weekNo} trong "LỘ TRÌNH THEO TUẦN" ở khung trên, hãy soạn GIÁO ÁN CHI TIẾT cho TUẦN ${weekNo} — gồm các buổi ${start} đến ${end} (${spw} buổi/tuần). KHÔNG soạn lại phần khung, KHÔNG soạn buổi của tuần khác.

Mỗi buổi đánh số tiêu đề "### Buổi X" và gồm đủ:
- Mục tiêu buổi.
- Khởi động (số phút + nội dung).
- Kỹ thuật trọng tâm (bài tập cụ thể + khối lượng số lần/hiệp + điểm kỹ thuật cần sửa).
- Chiến thuật / phối hợp.
- Thể lực.
- Trò chơi / ứng dụng thi đấu.
- Thả lỏng & nhận xét.
- Dụng cụ cần chuẩn bị.

Nếu theo lộ trình TUẦN ${weekNo} có buổi KIỂM TRA định kỳ, hãy soạn buổi đó dưới dạng buổi kiểm tra (bài test cụ thể + thang điểm).

${STYLE_RULES}
${libRefs}${note}`;
}

// Split [1..total] sessions into `parts` roughly-equal contiguous ranges,
// e.g. splitSessions(16, 4) -> [[1,4],[5,8],[9,12],[13,16]].
function splitSessions(total: number, parts: number): [number, number][] {
  const n = Math.min(Math.max(parts, 1), total);
  const base = Math.floor(total / n);
  let rem = total % n;
  const ranges: [number, number][] = [];
  let start = 1;
  for (let i = 0; i < n; i++) {
    const size = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    const end = start + size - 1;
    ranges.push([start, end]);
    start = end + 1;
  }
  return ranges;
}

export const generateWithKieAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const settings = await loadSettings(supabase);
    const isAnthropic = settings.provider === "anthropic";
    if (isAnthropic) {
      if (!settings.anthropicKey || settings.anthropicKey === "PLACEHOLDER_REPLACE_ME") {
        throw new Error("Chưa cấu hình Anthropic API key. Vào trang Cài đặt (Admin) để nhập key, hoặc chuyển nhà cung cấp về kie.ai.");
      }
    } else if (!settings.apiKey || settings.apiKey === "PLACEHOLDER_REPLACE_ME") {
      throw new Error("API key của kie.ai chưa được cấu hình. Vui lòng vào trang Cài đặt (Admin) để nhập API key thật.");
    }
    // Larger per-call budget on Anthropic (128k ceiling) lets each chunk cover more.
    const callMax = isAnthropic ? 16000 : 8192;
    const autoBatch = isAnthropic ? 10 : 6;

    const retrievalQuery = buildRetrievalQuery(data.type, data.target, data.extraContext);
    const libRefs = await retrieveContext(supabase, retrievalQuery, settings);

    const systemPrompt =
      "Bạn là trợ lý chuyên môn cho HLV bóng rổ tại BDC Basketball Centre. Trả lời chuyên nghiệp, có cấu trúc, dùng tiếng Việt.";

    let aiText = "";
    if (data.type === "curriculum") {
      // kie.ai caps a single response at ~8192 tokens, so a full multi-session
      // program is generated in several calls and stitched together:
      // 1) the program design/framework, then 2) batches of detailed sessions.
      const weeks = data.weeks ?? 8;
      const spw = data.sessionsPerWeek ?? 2;
      const total = Math.min(Math.max(weeks * spw, 1), 40);

      const design = await callAi(
        settings,
        systemPrompt,
        buildCurriculumDesignPrompt(data.target, weeks, spw, total, libRefs, data.extraContext),
        callMax,
      );

      // How many calls to split the per-session plans into. User-chosen `parts`,
      // else auto (fewer/larger calls on Anthropic, smaller on kie.ai's gateway).
      const parts = data.parts && data.parts > 0 ? Math.min(data.parts, total) : Math.ceil(total / autoBatch);
      const ranges = splitSessions(total, parts);
      const sessionParts: string[] = [];
      for (const [start, end] of ranges) {
        sessionParts.push(
          await callAi(
            settings,
            systemPrompt,
            buildSessionBatchPrompt(data.target, total, start, end, design, libRefs, data.extraContext),
            callMax,
          ),
        );
      }

      aiText = `${design}\n\n## D. GIÁO ÁN CHI TIẾT TỪNG BUỔI\n\n${sessionParts.join("\n\n")}`.trim();
    } else {
      aiText = await callAi(settings, systemPrompt, buildPrompt(data, libRefs), callMax);
    }

    await supabase.from("ai_generations").insert({
      coach_id: userId,
      generation_type: data.type,
      target_label: data.target,
      prompt: `${data.type} · ${data.target}`,
      response: aiText,
      student_id: data.studentId ?? null,
    });

    return { content: aiText };
  });

// --- Week-by-week curriculum: each call is short, so the UI can generate the
// framework first, then weeks one at a time (or continuously), then stitch. ---
const CurriculumSchema = z.object({
  scope: z.enum(["design", "week"]),
  target: z.string().min(1).max(120),
  weeks: z.number().int().min(1).max(24),
  sessionsPerWeek: z.number().int().min(1).max(7),
  extraContext: z.string().max(4000).optional(),
  week: z.number().int().min(1).max(24).optional(),
  designContext: z.string().max(20000).optional(),
});

export const generateCurriculumPart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CurriculumSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const settings = await loadSettings(supabase);
    const isAnthropic = settings.provider === "anthropic";
    if (isAnthropic) {
      if (!settings.anthropicKey || settings.anthropicKey === "PLACEHOLDER_REPLACE_ME") {
        throw new Error("Chưa cấu hình Anthropic API key. Vào trang Cài đặt (Admin) để nhập key, hoặc chuyển nhà cung cấp về kie.ai.");
      }
    } else if (!settings.apiKey || settings.apiKey === "PLACEHOLDER_REPLACE_ME") {
      throw new Error("API key của kie.ai chưa được cấu hình. Vui lòng vào trang Cài đặt (Admin) để nhập API key thật.");
    }
    const callMax = isAnthropic ? 16000 : 8192;
    const systemPrompt =
      "Bạn là trợ lý chuyên môn cho HLV bóng rổ tại BDC Basketball Centre. Trả lời chuyên nghiệp, có cấu trúc, dùng tiếng Việt.";

    const total = Math.min(Math.max(data.weeks * data.sessionsPerWeek, 1), 168);
    const retrievalQuery = buildRetrievalQuery("curriculum", data.target, data.extraContext);
    const libRefs = await retrieveContext(supabase, retrievalQuery, settings);

    let aiText = "";
    let label = "";
    if (data.scope === "design") {
      aiText = await callAi(
        settings,
        systemPrompt,
        buildCurriculumDesignPrompt(data.target, data.weeks, data.sessionsPerWeek, total, libRefs, data.extraContext),
        callMax,
      );
      label = `${data.target} · khung`;
    } else {
      const w = data.week ?? 1;
      aiText = await callAi(
        settings,
        systemPrompt,
        buildWeekPrompt(data.target, total, w, data.sessionsPerWeek, data.designContext ?? "", libRefs, data.extraContext),
        callMax,
      );
      label = `${data.target} · tuần ${w}`;
    }

    await supabase.from("ai_generations").insert({
      coach_id: userId,
      generation_type: "curriculum",
      target_label: label,
      prompt: `curriculum-${data.scope}${data.week ? `-${data.week}` : ""} · ${data.target}`,
      response: aiText,
      student_id: null,
    });

    return { content: aiText };
  });

// Auto-save a produced program into the coach's "My Creations" folder.
// Pass `id` to update an existing creation (used while a curriculum builds up
// week-by-week); omit it to create a new one.
const SaveCreationSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(200000),
  meta: z.record(z.any()).optional(),
});

export const saveCreation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveCreationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { data: row, error } = await supabase
        .from("creations")
        .update({ title: data.title, content: data.content, meta: data.meta ?? {}, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    const { data: row, error } = await supabase
      .from("creations")
      .insert({ coach_id: userId, kind: data.kind, title: data.title, content: data.content, meta: data.meta ?? {} })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
