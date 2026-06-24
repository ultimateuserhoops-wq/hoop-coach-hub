import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/coach/programs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );

        const url = new URL(request.url);
        const coachId = url.searchParams.get("coach_id");

        let query = supabase
          .from("training_programs")
          .select(`
            id, athlete_name, test_title, created_at, telegram_sent_at, telegram_recipient, coach_telegram_id,
            program_exercises (
              id, exercise_name, category, day_label, sets_reps,
              exercise_completions (id, completed_at),
              youtube_verifications (video_id, is_approved)
            )
          `)
          .order("created_at", { ascending: false });

        if (coachId) {
          query = query.eq("coach_telegram_id", coachId);
        }

        const { data, error } = await query;

        if (error) {
          return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: CORS });
        }

        // Enrich with completion stats
        const enriched = (data ?? []).map((p) => {
          const exercises = p.program_exercises ?? [];
          const total = exercises.length;
          const done = exercises.filter((e) => (e.exercise_completions?.length ?? 0) > 0).length;
          return { ...p, total_exercises: total, completed_exercises: done };
        });

        return new Response(JSON.stringify(enriched), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
