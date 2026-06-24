import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

interface YouTubeResult {
  videoId: string;
  title: string;
  channel: string;
}

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });
}

const VIDEO_KEYWORDS = ["video", "xem", "link", "youtube", "clip", "hướng dẫn", "tutorial", "watch", "demo", "show me", "cho xem"];

function isAskingForVideo(text: string): boolean {
  const lower = text.toLowerCase();
  return VIDEO_KEYWORDS.some((kw) => lower.includes(kw));
}

async function searchYouTube(apiKey: string, query: string): Promise<YouTubeResult[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json() as {
    items?: Array<{
      id: { videoId: string };
      snippet: { title: string; channelTitle: string };
    }>;
  };
  return (data.items ?? []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
  }));
}

export const Route = createFileRoute("/api/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const youtubeKey = process.env.YOUTUBE_API_KEY;

        if (!token) {
          return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }), {
            status: 503,
            headers: CORS,
          });
        }

        const update = await request.json() as TelegramUpdate;
        const msg = update.message;

        if (!msg?.text) {
          return new Response(JSON.stringify({ ok: true }), { headers: CORS });
        }

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const firstName = msg.from.first_name;

        // Fetch this user's most recent training program for context
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );

        const { data: programs } = await supabase
          .from("training_programs")
          .select(`
            id, athlete_name, test_title, created_at,
            program_exercises (
              exercise_name, category, day_label, sets_reps, notes,
              exercise_completions (completed_at)
            )
          `)
          .eq("telegram_recipient", String(chatId))
          .order("created_at", { ascending: false })
          .limit(1);

        const program = programs?.[0];

        type ExerciseRow = {
          exercise_name: string;
          category: string;
          day_label: string;
          sets_reps: string | null;
          notes: string | null;
          exercise_completions: Array<{ completed_at: string }>;
        };

        let programContext = "";
        let exerciseNames: string[] = [];
        if (program) {
          const exercises = (program.program_exercises ?? []) as ExerciseRow[];
          const total = exercises.length;
          const done = exercises.filter((e) => e.exercise_completions?.length > 0).length;
          exerciseNames = exercises.map((e) => e.exercise_name);
          const exerciseList = exercises
            .map((e) =>
              `- ${e.exercise_name} (${e.day_label}, ${e.sets_reps ?? ""})${e.exercise_completions?.length > 0 ? " ✓" : ""}`,
            )
            .join("\n");

          programContext = `
Vận động viên: ${program.athlete_name}
Bài kiểm tra: ${program.test_title}
Tiến độ: ${done}/${total} bài tập đã hoàn thành
Danh sách bài tập:
${exerciseList}
`;
        }

        // Search YouTube if the user is asking for a video
        let youtubeSection = "";
        if (isAskingForVideo(text) && youtubeKey) {
          // Determine which exercise to search for
          let searchQuery = text;

          // Try to match a known exercise from their program first
          const lower = text.toLowerCase();
          const matched = exerciseNames.find((name) => lower.includes(name.toLowerCase()));
          if (matched) {
            searchQuery = `${matched} exercise tutorial basketball`;
          } else {
            // Let Claude extract the exercise name — search directly with the user's query
            searchQuery = `${text} basketball exercise tutorial`;
          }

          const videos = await searchYouTube(youtubeKey, searchQuery);
          if (videos.length > 0) {
            youtubeSection =
              "\n\nVideo hướng dẫn:\n" +
              videos
                .map((v, i) => `${i + 1}. [${v.title}](https://youtu.be/${v.videoId}) — ${v.channel}`)
                .join("\n");
          }
        }

        if (!anthropicKey) {
          const fallback = program
            ? `Xin chào ${firstName}! Chương trình của bạn đang chờ. Mở link đã gửi để xem bài tập.`
            : `Xin chào ${firstName}! Liên hệ HLV để nhận chương trình tập luyện của bạn.`;
          await sendTelegramMessage(token, chatId, fallback + youtubeSection);
          return new Response(JSON.stringify({ ok: true }), { headers: CORS });
        }

        const anthropic = new Anthropic({ apiKey: anthropicKey });

        const systemPrompt = `Bạn là trợ lý HLV bóng rổ thông minh của BDC Basketball, được tích hợp vào Telegram.
Bạn hỗ trợ vận động viên và phụ huynh với:
- Câu hỏi về kỹ thuật bài tập (squat, box jump, agility drill...)
- Tiến độ chương trình tập luyện cá nhân
- Lời khuyên dinh dưỡng và phục hồi thể lực
- Kiểm tra tính chính xác của hướng dẫn tập luyện
- Giải thích các bài kiểm tra thể lực (speed, agility, vertical jump...)

Phong cách: ngắn gọn, thân thiện, chuyên nghiệp. Trả lời bằng tiếng Việt trừ khi người dùng hỏi bằng tiếng Anh.
Giới hạn 250 từ. Không liệt kê video — hệ thống sẽ tự thêm video bên dưới câu trả lời của bạn nếu có.

${program ? `\nDữ liệu chương trình hiện tại của vận động viên:\n${programContext}` : "\nVận động viên chưa có chương trình tập luyện được gán."}`;

        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: "user", content: text }],
          });

          const aiReply =
            response.content[0].type === "text"
              ? response.content[0].text
              : "Xin lỗi, không thể xử lý tin nhắn.";

          await sendTelegramMessage(token, chatId, aiReply + youtubeSection);
        } catch {
          await sendTelegramMessage(
            token,
            chatId,
            "Xin lỗi, hệ thống AI đang bận. Vui lòng thử lại sau." + youtubeSection,
          );
        }

        return new Response(JSON.stringify({ ok: true }), { headers: CORS });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
