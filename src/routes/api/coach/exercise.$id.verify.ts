import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/coach/exercise/$id/verify")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const { id: exercise_id } = params;
        const body = await request.json() as { video_id: string; is_approved: boolean };

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );

        // Upsert so coach can change decision
        const { error } = await supabase
          .from("youtube_verifications")
          .upsert(
            { exercise_id, video_id: body.video_id, is_approved: body.is_approved, verified_at: new Date().toISOString() },
            { onConflict: "exercise_id,video_id" },
          );

        if (error) {
          return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: CORS });
        }
        return new Response(JSON.stringify({ ok: true }), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
