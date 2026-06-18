import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCoachOfTheMonth } from "@/lib/coach-stats.functions";
import { Button } from "@/components/ui/button";
import { Trophy, BookOpen, Users, ClipboardList, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BDC Basketball — Phần mềm hỗ trợ chuyên môn" },
      { name: "description", content: "Hệ thống soạn giáo án AI, quản lý học viên và try-out Elite cho HLV BDC Basketball Centre." },
      { property: "og:title", content: "BDC Basketball — Phần mềm hỗ trợ chuyên môn" },
      { property: "og:description", content: "Soạn giáo án AI, quản lý học viên, theo dõi tiến bộ và bình chọn HLV của tháng." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const fetchCotm = useServerFn(getCoachOfTheMonth);
  const { data: cotm } = useQuery({ queryKey: ["cotm-public"], queryFn: () => fetchCotm() });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="court-bg court-lines">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-32 text-court-foreground">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-12 rounded-xl bg-primary flex items-center justify-center font-display text-2xl text-primary-foreground">B</div>
            <span className="font-display text-xl">BDC BASKETBALL CENTRE</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl leading-none max-w-3xl uppercase">
            Phần mềm hỗ trợ &<br />
            <span className="text-primary">quản lý chuyên môn</span>
          </h1>
          <p className="mt-6 max-w-2xl text-court-foreground/80 text-lg">
            Soạn giáo án bằng AI, thiết kế phương án try-out cho lớp Elite, theo dõi tiến bộ học viên và bình chọn HLV của tháng — tất cả trên một nền tảng dành riêng cho HLV BDC.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">Đăng nhập HLV <ArrowRight className="size-4" /></Button></Link>
            <Link to="/coach-of-the-month"><Button size="lg" variant="outline" className="border-court-foreground/30 text-court-foreground hover:bg-court-foreground/10">HLV của tháng <Trophy className="size-4" /></Button></Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="font-display text-3xl md:text-4xl uppercase mb-10">Tính năng cốt lõi</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { i: BookOpen, t: "AI Soạn giáo án", d: "Sinh giáo án 8 tuần cho 3 trình độ Cơ bản / Trung cấp / Nâng cao với mô hình Opus 4.8 và tài liệu thư viện BDC." },
            { i: ClipboardList, t: "Try-out Elite U10–U15", d: "Trợ lý AI thiết kế phương án tuyển chọn theo nhóm tuổi: drill, thang điểm, quy trình." },
            { i: Users, t: "Theo dõi tiến bộ", d: "Database học viên, biểu đồ test theo thời gian, thông báo Zalo cho phụ huynh." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border bg-card p-6 hover:shadow-court transition-shadow">
              <div className="size-12 rounded-lg bg-accent flex items-center justify-center mb-4"><f.i className="size-6 text-primary" /></div>
              <h3 className="font-display text-xl mb-2">{f.t}</h3>
              <p className="text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coach of month preview */}
      {cotm && (
        <section className="bg-accent/30">
          <div className="max-w-6xl mx-auto px-6 py-16 flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="uppercase text-xs tracking-widest text-primary font-semibold mb-2">HLV của tháng</div>
              <div className="font-display text-4xl">{cotm.coach_name}</div>
              <div className="text-sm text-muted-foreground mt-2">Điểm tổng hợp: {Number(cotm.total_score).toFixed(2)}</div>
            </div>
            <Link to="/coach-of-the-month"><Button variant="outline">Xem chi tiết <ArrowRight className="size-4" /></Button></Link>
          </div>
        </section>
      )}

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © BDC Basketball Centre — Phần mềm hỗ trợ chuyên môn
      </footer>
    </div>
  );
}
