import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60",
};

export const Route = createFileRoute("/api/public/library")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false } },
          );
          const { data, error } = await supabase
            .from("library_documents")
            .select("id, title, description, chunk_count, ingest_status, created_at")
            .eq("ingest_status", "done")
            .order("created_at", { ascending: false });

          if (error) throw error;
          return new Response(JSON.stringify(data ?? []), { headers: CORS });
        } catch (err) {
          return new Response(
            JSON.stringify({ error: String(err) }),
            { status: 500, headers: CORS },
          );
        }
      },
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS }),
    },
  },
});
