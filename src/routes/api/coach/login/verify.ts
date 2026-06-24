import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function generateOtp(secret: string, chatId: string, windowOffset = 0): Promise<string> {
  const window = Math.floor(Date.now() / (5 * 60 * 1000)) + windowOffset;
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
  const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1_000_000;
  return String(num).padStart(6, "0");
}

export const Route = createFileRoute("/api/coach/login/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          return new Response(JSON.stringify({ error: "Bot not configured" }), { status: 503, headers: CORS });
        }

        const { chat_id, code } = await request.json() as { chat_id: string; code: string };
        if (!chat_id || !code) {
          return new Response(JSON.stringify({ error: "Missing chat_id or code" }), { status: 400, headers: CORS });
        }

        // Accept current window and previous window (handles clock skew / edge-of-window)
        const [current, prev] = await Promise.all([
          generateOtp(token, chat_id.trim()),
          generateOtp(token, chat_id.trim(), -1),
        ]);

        if (code.trim() !== current && code.trim() !== prev) {
          return new Response(JSON.stringify({ error: "Mã không đúng hoặc đã hết hạn" }), { status: 401, headers: CORS });
        }

        return new Response(JSON.stringify({ ok: true, coach_telegram_id: chat_id.trim() }), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
