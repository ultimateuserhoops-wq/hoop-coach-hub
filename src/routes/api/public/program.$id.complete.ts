import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/public/program/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json() as { exercise_id: string; note?: string };
        if (!body.exercise_id) {
          return new Response(JSON.stringify({ error: "exercise_id required" }), { status: 400, headers: CORS });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data, error } = await supabase
          .from("exercise_completions")
          .insert({ exercise_id: body.exercise_id, note: body.note ?? null })
          .select("id, completed_at")
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: CORS });
        }
        return new Response(JSON.stringify(data), { status: 201, headers: CORS });
      },
      DELETE: async ({ request }) => {
        const body = await request.json() as { exercise_id: string };
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );
        await supabase.from("exercise_completions").delete().eq("exercise_id", body.exercise_id);
        return new Response(JSON.stringify({ ok: true }), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
