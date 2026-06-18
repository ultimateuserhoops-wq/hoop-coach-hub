import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCoachOfTheMonth } from "@/lib/coach-stats.functions";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/coach-of-the-month")({
  head: () => ({
    meta: [
      { title: "HLV của tháng — BDC Basketball" },
      { name: "description", content: "Bình chọn HLV của tháng tại BDC Basketball Centre dựa trên hoạt động và tiến bộ học viên." },
      { property: "og:title", content: "HLV của tháng — BDC Basketball" },
      { property: "og:description", content: "HLV của tháng tại BDC Basketball Centre." },
    ],
  }),
  component: CotmPage,
});

function CotmPage() {
  const fetchCotm = useServerFn(getCoachOfTheMonth);
  const { data, isLoading } = useQuery({ queryKey: ["cotm-public"], queryFn: () => fetchCotm() });

  return (
    <div className="min-h-screen court-bg court-lines text-court-foreground flex flex-col">
      <header className="px-6 py-5 border-b border-court-foreground/10 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2"><div className="size-8 rounded-md bg-primary flex items-center justify-center font-display text-primary-foreground">B</div><span className="font-display">BDC Basketball</span></Link>
        <Link to="/auth"><Button variant="outline" className="border-court-foreground/30 text-court-foreground hover:bg-court-foreground/10">HLV đăng nhập</Button></Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="text-center max-w-2xl">
          <div className="uppercase tracking-widest text-primary text-sm font-semibold mb-4">🏆 HLV của tháng</div>
          {isLoading ? (
            <div className="text-court-foreground/60">Đang tải…</div>
          ) : data ? (
            <>
              <Trophy className="size-20 text-primary mx-auto mb-6" />
              <h1 className="font-display text-6xl md:text-8xl mb-6 uppercase">{data.coach_name}</h1>
              <div className="grid grid-cols-3 gap-6 mt-10 max-w-xl mx-auto">
                <div><div className="font-display text-4xl text-primary">{Number(data.usage_score).toFixed(0)}</div><div className="text-xs text-court-foreground/60 uppercase tracking-wider mt-1">Lượt AI</div></div>
                <div><div className="font-display text-4xl text-primary">{Number(data.performance_score).toFixed(2)}</div><div className="text-xs text-court-foreground/60 uppercase tracking-wider mt-1">Tiến bộ TB</div></div>
                <div><div className="font-display text-4xl text-primary">{Number(data.total_score).toFixed(2)}</div><div className="text-xs text-court-foreground/60 uppercase tracking-wider mt-1">Tổng điểm</div></div>
              </div>
              <p className="text-court-foreground/60 mt-10 text-sm">Tháng {String(new Date(data.month).getMonth() + 1).padStart(2, "0")}/{new Date(data.month).getFullYear()}</p>
            </>
          ) : (
            <div className="text-court-foreground/60">Chưa có dữ liệu cho tháng này.</div>
          )}
        </div>
      </main>
      <footer className="text-center text-xs text-court-foreground/40 py-6">© BDC Basketball Centre · Nhúng widget: <code className="text-court-foreground/60">/api/public/coach-of-the-month</code></footer>
    </div>
  );
}
