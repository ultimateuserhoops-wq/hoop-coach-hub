import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/coach-of-the-month")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const monthStart = new Date();
        monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
        const monthStr = monthStart.toISOString().slice(0, 10);

        const { data: cached } = await supabase.from("coach_of_the_month").select("*").eq("month", monthStr).maybeSingle();
        let payload: any = cached;
        if (!payload) {
          const { data } = await supabase.rpc("compute_coach_of_the_month");
          const row = Array.isArray(data) ? data[0] : data;
          if (row) {
            payload = {
              month: monthStr,
              coach_name: row.coach_name,
              usage_score: Number(row.usage_score) || 0,
              performance_score: Number(row.performance_score) || 0,
              total_score: Number(row.total_score) || 0,
            };
          }
        }
        return new Response(JSON.stringify(payload ?? null), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } }),
    },
  },
});
