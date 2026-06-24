import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function adminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface ParsedExercise {
  exercise_name: string;
  category: string;
  day_label: string;
  sets_reps: string;
  notes: string;
  sort_order: number;
}

const DAY_NAMES_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function buildDayLabels(weeksCount: number, daysPerWeek: number): string[] {
  // Choose which weekdays to use based on daysPerWeek
  const daySlots: string[] = {
    2: ['T2', 'T5'],
    3: ['T2', 'T4', 'T6'],
    4: ['T2', 'T4', 'T5', 'T7'],
    5: ['T2', 'T3', 'T5', 'T6', 'T7'],
  }[daysPerWeek] ?? ['T2', 'T4', 'T6'];

  const labels: string[] = [];
  for (let w = 1; w <= weeksCount; w++) {
    for (let d = 0; d < daysPerWeek; d++) {
      labels.push(`Tuần ${w} - ${daySlots[d]}`);
    }
  }
  return labels;
}

async function generateMultiWeekProgram(
  reportText: string,
  weeksCount: number,
  daysPerWeek: number,
  anthropicKey: string,
): Promise<ParsedExercise[]> {
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const dayLabels = buildDayLabels(weeksCount, daysPerWeek);
  const dayLabelsStr = dayLabels.map((l, i) => `${i + 1}. "${l}"`).join(', ');

  const systemPrompt = `Bạn là BDC Training Engine — chuyên gia lập kế hoạch tập luyện bóng rổ trẻ theo mô hình NASM OPT.
Nhiệm vụ: Tạo chương trình ${weeksCount} tuần với ${daysPerWeek} buổi/tuần dựa trên kết quả đánh giá của vận động viên.

QUY TẮC:
- Trả về ĐÚNG một JSON array. KHÔNG có text ngoài JSON. KHÔNG có markdown backticks.
- Mỗi object trong array có các trường: exercise_name, category, day_label, sets_reps, notes, sort_order
- day_label PHẢI là một trong: ${dayLabelsStr}
- Mỗi day_label phải có ít nhất 3–6 bài tập
- Tăng dần cường độ mỗi tuần: Tuần 1 nhẹ hơn Tuần 2, Tuần 2 nhẹ hơn Tuần 3, v.v.
- category: chọn từ "plyometric", "strength", "agility", "power", "conditioning", "mobility", "shooting", "skills"
- sets_reps: bao gồm đủ: số set × số rep/thời gian + thông số quan trọng (vd: "3×10, nghỉ 60s", "4×5, 75-80% 1RM")
- notes: cue kỹ thuật ngắn gọn (1–2 câu tiếng Việt)
- sort_order: số nguyên bắt đầu từ 0 cho mỗi ngày (reset về 0 mỗi day_label mới)

NASM OPT PROGRESSION (áp dụng qua ${weeksCount} tuần):
- Tuần đầu (${weeksCount > 4 ? Math.ceil(weeksCount/3) : 1}–${weeksCount > 4 ? Math.ceil(weeksCount/3) : 2} tuần): Phase 1 Stabilization — 2–3 set, 12–20 rep, tempo chậm, trọng lượng nhẹ
- Tuần giữa: Phase 2 Strength Endurance — 3–4 set, 8–12 rep, cường độ trung bình
- Tuần cuối: Phase 4–5 Power — 4–5 set, 3–8 rep, cường độ cao hoặc plyometric`;

  const userPrompt = `Dựa vào kết quả đánh giá dưới đây, tạo chương trình ${weeksCount} tuần với ${daysPerWeek} buổi/tuần.
Tập trung vào các điểm yếu được xác định trong báo cáo.

BÁO CÁO ĐÁNH GIÁ:
${reportText.slice(0, 6000)}

Tạo lịch tập cho TẤT CẢ ${dayLabels.length} buổi. Đảm bảo mỗi buổi có 4–6 bài tập phù hợp.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ParsedExercise[];
  } catch {
    return [];
  }
}

async function parseExercisesWithClaude(reportHtml: string, anthropicKey: string): Promise<ParsedExercise[]> {
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Strip HTML tags for cleaner text input
  const plainText = reportHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 8000); // limit tokens

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `You are a sports science assistant. Extract training exercises from a basketball athlete's assessment report.
Return ONLY a JSON array with no extra text. Each object must have:
- exercise_name: exact exercise name (e.g. "Box Jump", "Back Squat", "5-10-5 Pro Agility")
- category: one of "plyometric", "strength", "agility", "power", "conditioning", "mobility"
- day_label: training days in Vietnamese (e.g. "Thứ 2 & 5", "Thứ 3 & 6", "Thứ 4 & 7")
- sets_reps: full prescription including sets × reps AND any key parameters like weight (%1RM or kg), box height, distance (e.g. "3×6, hộp 40-50cm", "4×5-6, cường độ 75-80% 1RM", "3×10m sprint")
- notes: any important technique cues, safety notes, or progression info (1-2 sentences max)
- sort_order: integer starting from 0

Rules:
- Include box height for jumps (e.g. "hộp 40-50cm")
- Include weight/intensity for strength exercises (%1RM or kg range)
- Include distance/time for speed/agility drills
- Assign correct days: plyometric→"Thứ 2 & 5", strength→"Thứ 3 & 6", agility→"Thứ 4 & 7"
- Do NOT invent exercises not mentioned in the report
- Return empty array [] if no exercises found`,
    messages: [{
      role: "user",
      content: `Extract all training exercises from this report:\n\n${plainText}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ParsedExercise[];
  } catch {
    return [];
  }
}

async function fetchYouTubeForProgram(programId: string, supabase: ReturnType<typeof adminClient>, apiKey: string) {
  const { data: exercises } = await supabase
    .from("program_exercises")
    .select("id, exercise_name")
    .eq("program_id", programId)
    .is("youtube_fetched_at", null);

  if (!exercises?.length) return;

  for (const ex of exercises) {
    const query = `${ex.exercise_name} exercise tutorial basketball`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) continue;

    const json = await res.json() as {
      items: Array<{
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } };
      }>;
    };
    const videos = (json.items ?? []).map((r) => ({
      videoId: r.id.videoId,
      title: r.snippet.title,
      channel: r.snippet.channelTitle,
      thumbnail: r.snippet.thumbnails.medium.url,
    }));

    await supabase
      .from("program_exercises")
      .update({ youtube_videos: videos, youtube_fetched_at: new Date().toISOString() })
      .eq("id", ex.id);

    await new Promise((r) => setTimeout(r, 200));
  }
}

export const Route = createFileRoute("/api/internal/programs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            athlete_name: string;
            test_title: string;
            program_json: unknown;
            coach_telegram_id?: string;
            report_html?: string;
            weeks?: number;
            days_per_week?: number;
            focus_areas?: string[];
            exercises?: Array<{
              category: string;
              day_label: string;
              exercise_name: string;
              sets_reps?: string;
              notes?: string;
              sort_order?: number;
            }>;
          };

          const supabase = adminClient();
          const anthropicKey = process.env.ANTHROPIC_API_KEY;
          const youtubeKey = process.env.YOUTUBE_API_KEY;

          const weeksCount = Math.min(Math.max(body.weeks ?? 1, 1), 12);
          const daysPerWeek = Math.min(Math.max(body.days_per_week ?? 3, 2), 5);
          const isMultiWeek = weeksCount > 1;

          // Strip HTML for plain text
          const plainText = (body.report_html ?? '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          let exercises: ParsedExercise[] = [];

          if (anthropicKey) {
            if (isMultiWeek) {
              exercises = await generateMultiWeekProgram(plainText, weeksCount, daysPerWeek, anthropicKey);
            } else if (body.report_html) {
              exercises = await parseExercisesWithClaude(body.report_html, anthropicKey);
            }
          }

          // Fallback: use pre-sent exercises
          if (!exercises.length && body.exercises?.length) {
            exercises = body.exercises.map((e, i) => ({
              exercise_name: e.exercise_name,
              category: e.category,
              day_label: e.day_label,
              sets_reps: e.sets_reps ?? "",
              notes: e.notes ?? "",
              sort_order: e.sort_order ?? i,
            }));
          }

          // Insert program
          const { data: program, error: pErr } = await supabase
            .from("training_programs")
            .insert({
              athlete_name: body.athlete_name,
              test_title: body.test_title,
              program_json: {
                ...(body.program_json as object),
                weeks: weeksCount,
                days_per_week: daysPerWeek,
              },
              ...(body.coach_telegram_id ? { coach_telegram_id: body.coach_telegram_id } : {}),
            })
            .select("id")
            .single();

          if (pErr || !program) throw pErr ?? new Error("insert failed");

          // Insert exercises
          if (exercises.length) {
            const rows = exercises.map((e, i) => ({
              program_id: program.id,
              category: e.category,
              day_label: e.day_label,
              exercise_name: e.exercise_name,
              sets_reps: e.sets_reps || null,
              notes: e.notes || null,
              sort_order: e.sort_order ?? i,
            }));
            const { error: eErr } = await supabase.from("program_exercises").insert(rows);
            if (eErr) throw eErr;
          }

          // YouTube fetch inline (no HTTP-to-self needed)
          if (youtubeKey && exercises.length) {
            fetchYouTubeForProgram(program.id, supabase, youtubeKey).catch(() => {});
          }

          return new Response(
            JSON.stringify({ id: program.id, exercises_count: exercises.length }),
            { status: 201, headers: CORS },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ error: String(err) }),
            { status: 500, headers: CORS },
          );
        }
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
