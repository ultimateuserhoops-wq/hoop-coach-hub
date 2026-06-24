import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Stateless OTP: HMAC(secret, chatId + window) — 5-min window, no DB needed
async function generateOtp(secret: string, chatId: string): Promise<string> {
  const window = Math.floor(Date.now() / (5 * 60 * 1000));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${chatId}:${window}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const bytes = new Uint8Array(sig);
  // 6-digit code from first 3 bytes
  const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1_000_000;
  return String(num).padStart(6, "0");
}

export const Route = createFileRoute("/api/coach/login/request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          return new Response(JSON.stringify({ error: "Bot not configured" }), { status: 503, headers: CORS });
        }

        const { chat_id } = await request.json() as { chat_id: string };
        if (!chat_id || !/^\d+$/.test(chat_id.trim())) {
          return new Response(JSON.stringify({ error: "Invalid Telegram ID" }), { status: 400, headers: CORS });
        }

        const otp = await generateOtp(token, chat_id.trim());

        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chat_id.trim(),
            text: `🏀 *BDC Coach Login*\n\nMã xác nhận của bạn: *${otp}*\n\n_Mã có hiệu lực 5 phút. Không chia sẻ mã này._`,
            parse_mode: "Markdown",
          }),
        });

        const result = await res.json() as { ok: boolean; description?: string };
        if (!result.ok) {
          return new Response(
            JSON.stringify({ error: result.description ?? "Failed to send code. Check your Telegram ID." }),
            { status: 400, headers: CORS },
          );
        }

        return new Response(JSON.stringify({ ok: true }), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
