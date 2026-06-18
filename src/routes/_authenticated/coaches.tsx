import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/coaches")({ component: CoachesPage });

function CoachesPage() {
  const { data = [] } = useQuery({
    queryKey: ["coach-stats"],
    queryFn: async () => {
      // All coaches (profiles + has coach role)
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").eq("role", "coach");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);

      const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
      const { data: gens } = await supabase.from("ai_generations").select("coach_id").gte("created_at", monthStart.toISOString());
      const usage: Record<string, number> = {};
      (gens ?? []).forEach((g: any) => { usage[g.coach_id] = (usage[g.coach_id] ?? 0) + 1; });

      const { data: students } = await supabase.from("students").select("id, assigned_coach_id");
      const studentsByCoach: Record<string, string[]> = {};
      (students ?? []).forEach((s: any) => {
        if (!s.assigned_coach_id) return;
        studentsByCoach[s.assigned_coach_id] ??= [];
        studentsByCoach[s.assigned_coach_id].push(s.id);
      });

      return (profiles ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name ?? "(không tên)",
        usage: usage[p.id] ?? 0,
        students: studentsByCoach[p.id]?.length ?? 0,
      })).sort((a: any, b: any) => b.usage - a.usage);
    },
  });

  return (
    <>
      <PageHeader title="HLV" subtitle="Hoạt động và phân công học viên trong tháng" />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>HLV</TableHead>
                  <TableHead className="text-right">Lượt AI tháng này</TableHead>
                  <TableHead className="text-right">Học viên</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((c: any, i: number) => (
                  <TableRow key={c.id}>
                    <TableCell>{i === 0 && <Trophy className="size-4 text-primary" />}</TableCell>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="text-right font-display text-lg">{c.usage}</TableCell>
                    <TableCell className="text-right">{c.students}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Chưa có HLV.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
