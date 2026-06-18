import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCoachOfTheMonth } from "@/lib/coach-stats.functions";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, Trophy, ClipboardList, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const fetchCotm = useServerFn(getCoachOfTheMonth);
  const { data: cotm } = useQuery({ queryKey: ["cotm"], queryFn: () => fetchCotm() });
  const { data: counts } = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [students, gens, library] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("ai_generations").select("id", { count: "exact", head: true }),
        supabase.from("library_documents").select("id", { count: "exact", head: true }),
      ]);
      return {
        students: students.count ?? 0,
        gens: gens.count ?? 0,
        library: library.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Học viên", value: counts?.students ?? 0, icon: Users, href: "/students" },
    { label: "Lần sinh AI", value: counts?.gens ?? 0, icon: BookOpen, href: "/curriculum" },
    { label: "Tài liệu thư viện", value: counts?.library ?? 0, icon: ClipboardList, href: "/library" },
  ];

  return (
    <>
      <PageHeader title="Tổng quan" subtitle="Chào mừng trở lại sàn đấu" />
      <div className="p-6 space-y-6">
        <div className="grid md:grid-cols-3 gap-4">
          {stats.map((s) => (
            <Link key={s.label} to={s.href as any} className="block">
              <Card className="hover:shadow-court transition-shadow">
                <CardContent className="pt-6 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">{s.label}</div>
                    <div className="font-display text-4xl mt-1">{s.value}</div>
                  </div>
                  <div className="size-12 rounded-lg bg-accent flex items-center justify-center"><s.icon className="size-6 text-primary" /></div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {cotm && (
          <Card className="court-bg court-lines border-0 text-court-foreground overflow-hidden">
            <CardHeader>
              <CardTitle className="font-display uppercase tracking-wider text-primary text-sm">🏆 HLV của tháng</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-display text-5xl">{cotm.coach_name}</div>
                <div className="text-court-foreground/70 mt-2 text-sm">
                  Sử dụng AI: {Number(cotm.usage_score).toFixed(0)} lượt · Tiến bộ học viên: {Number(cotm.performance_score).toFixed(2)} · Tổng: {Number(cotm.total_score).toFixed(2)}
                </div>
              </div>
              <Link to="/coach-of-the-month"><Button variant="outline" className="border-court-foreground/30 text-court-foreground hover:bg-court-foreground/10">Trang công khai <ArrowRight className="size-4" /></Button></Link>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="font-display">Bắt đầu nhanh</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Link to="/curriculum"><Button variant="outline" className="w-full justify-between">Soạn giáo án AI <BookOpen className="size-4" /></Button></Link>
              <Link to="/tryouts"><Button variant="outline" className="w-full justify-between">Tạo phương án try-out <ClipboardList className="size-4" /></Button></Link>
              <Link to="/students"><Button variant="outline" className="w-full justify-between">Thêm điểm test học viên <Users className="size-4" /></Button></Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="font-display">Mục tiêu HLV của tháng</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">HLV của tháng được tính theo: <br />• Tần suất sử dụng AI (giáo án, try-out, gợi ý) <br />• Mức tiến bộ trung bình của học viên được phân công <br />Điểm tổng = lượt AI × 1.0 + tiến bộ × 2.0</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
