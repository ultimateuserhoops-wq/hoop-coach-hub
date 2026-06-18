import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const getCoachOfTheMonth = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  // Try cached row for current month first
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStr = monthStart.toISOString().slice(0, 10);

  const { data: cached } = await supabase
    .from("coach_of_the_month")
    .select("*")
    .eq("month", monthStr)
    .maybeSingle();
  if (cached) return cached;

  // Compute live
  const { data, error } = await supabase.rpc("compute_coach_of_the_month");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    month: monthStr,
    coach_id: row.coach_id,
    coach_name: row.coach_name,
    usage_score: Number(row.usage_score) || 0,
    performance_score: Number(row.performance_score) || 0,
    total_score: Number(row.total_score) || 0,
    computed_at: new Date().toISOString(),
  };
});
