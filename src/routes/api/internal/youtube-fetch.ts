import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface YTItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    description: string;
    thumbnails: { medium: { url: string } };
  };
}

async function searchYouTube(query: string, apiKey: string): Promise<YTItem[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json() as { items: YTItem[] };
  return json.items ?? [];
}

export const Route = createFileRoute("/api/internal/youtube-fetch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }),
            { status: 503, headers: CORS },
          );
        }

        const { program_id } = await request.json() as { program_id: string };

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data: exercises } = await supabase
          .from("program_exercises")
          .select("id, exercise_name")
          .eq("program_id", program_id)
          .is("youtube_fetched_at", null);

        if (!exercises?.length) {
          return new Response(JSON.stringify({ fetched: 0 }), { headers: CORS });
        }

        let fetched = 0;
        for (const ex of exercises) {
          const results = await searchYouTube(`${ex.exercise_name} exercise tutorial basketball`, apiKey);
          const videos = results.map((r) => ({
            videoId: r.id.videoId,
            title: r.snippet.title,
            channel: r.snippet.channelTitle,
            thumbnail: r.snippet.thumbnails.medium.url,
          }));

          await supabase
            .from("program_exercises")
            .update({ youtube_videos: videos, youtube_fetched_at: new Date().toISOString() })
            .eq("id", ex.id);

          fetched++;
          // stay within YouTube quota: small delay between requests
          await new Promise((r) => setTimeout(r, 200));
        }

        return new Response(JSON.stringify({ fetched }), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
