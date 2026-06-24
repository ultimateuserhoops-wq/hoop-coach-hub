import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300",
};

const MAX_CHUNKS = 60;

export const Route = createFileRoute("/api/public/library/$id/chunks")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;
        if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
          return new Response(JSON.stringify({ error: "Invalid id" }), {
            status: 400,
            headers: CORS,
          });
        }
        try {
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false } },
          );

          const { data: doc, error: docErr } = await supabase
            .from("library_documents")
            .select("id, title, ingest_status, chunk_count")
            .eq("id", id)
            .eq("ingest_status", "done")
            .maybeSingle();

          if (docErr) throw docErr;
          if (!doc) {
            return new Response(
              JSON.stringify({ error: "Document not found or not ingested" }),
              { status: 404, headers: CORS },
            );
          }

          const { data: chunks, error: chunkErr } = await supabase
            .from("document_chunks")
            .select("chunk_index, content")
            .eq("document_id", id)
            .order("chunk_index", { ascending: true })
            .limit(MAX_CHUNKS);

          if (chunkErr) throw chunkErr;

          const content = (chunks ?? []).map((c) => c.content).join("\n\n");
          const truncated = (doc.chunk_count ?? 0) > MAX_CHUNKS;

          return new Response(
            JSON.stringify({
              id: doc.id,
              title: doc.title,
              chunk_count: doc.chunk_count,
              chunks_returned: chunks?.length ?? 0,
              truncated,
              content,
            }),
            { headers: CORS },
          );
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: CORS,
          });
        }
      },
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS }),
    },
  },
});
