import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/public/program/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;
        if (!/^[0-9a-f-]{36}$/.test(id)) {
          return new Response(JSON.stringify({ error: "invalid id" }), { status: 400, headers: CORS });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data: program, error } = await supabase
          .from("training_programs")
          .select("*")
          .eq("id", id)
          .single();

        if (error || !program) {
          return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: CORS });
        }

        const { data: exercises } = await supabase
          .from("program_exercises")
          .select("*, exercise_completions(id, completed_at), youtube_verifications(video_id, is_approved)")
          .eq("program_id", id)
          .order("sort_order");

        return new Response(
          JSON.stringify({ ...program, exercises: exercises ?? [] }),
          { headers: CORS },
        );
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
