import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/internal/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          return new Response(
            JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }),
            { status: 503, headers: CORS },
          );
        }

        const body = await request.json() as {
          program_id: string;
          athlete_name: string;
          chat_id: string; // Telegram username (e.g. "@coach123") or numeric chat ID
          program_url: string;
        };

        const text =
          `🏀 *Chương trình tập luyện mới* — BDC Basketball\n\n` +
          `Xin chào! HLV đã tạo chương trình tập luyện cá nhân cho *${body.athlete_name}*.\n\n` +
          `📱 Mở chương trình tại:\n${body.program_url}\n\n` +
          `👉 Đánh dấu hoàn thành từng bài sau khi tập xong.\n` +
          `_BDC Basketball Testing System_`;

        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: body.chat_id,
              text,
              parse_mode: "Markdown",
              disable_web_page_preview: false,
            }),
          },
        );

        const result = await res.json() as { ok: boolean; description?: string };
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: result.description ?? "Telegram error" }),
            { status: 400, headers: CORS },
          );
        }

        // Record send timestamp
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );
        await supabase
          .from("training_programs")
          .update({ telegram_sent_at: new Date().toISOString(), telegram_recipient: body.chat_id })
          .eq("id", body.program_id);

        return new Response(JSON.stringify({ ok: true }), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
