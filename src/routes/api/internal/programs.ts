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
            // New: raw HTML for Claude parsing
            report_html?: string;
            // Legacy: pre-parsed exercises (fallback)
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

          // Parse exercises: prefer Claude on server, fall back to client-sent list
          let exercises: ParsedExercise[] = [];
          if (body.report_html && anthropicKey) {
            exercises = await parseExercisesWithClaude(body.report_html, anthropicKey);
          } else if (body.exercises?.length) {
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
              program_json: body.program_json,
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
