import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateWithKieAi } from "@/lib/ai.functions";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ArrowLeft, MessageCircle, Plus, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/students/$id")({ component: StudentDetail });

function StudentDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const generate = useServerFn(generateWithKieAi);
  const [scoreForm, setScoreForm] = useState({ skill_category_id: "", score: "", tested_at: new Date().toISOString().slice(0, 10), notes: "" });
  const [scoreOpen, setScoreOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const { data: student } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: async () => (await supabase.from("skill_categories").select("*").order("display_order")).data ?? [],
  });
  const { data: scores = [] } = useQuery({
    queryKey: ["scores", id],
    queryFn: async () => (await supabase.from("test_scores").select("*, skill_categories(name)").eq("student_id", id).order("tested_at")).data ?? [],
  });

  // Chart data: pivot by skill name + date
  const chartData = (() => {
    const byDate: Record<string, any> = {};
    scores.forEach((s: any) => {
      const d = s.tested_at;
      byDate[d] ??= { date: d };
      byDate[d][s.skill_categories?.name ?? "?"] = Number(s.score);
    });
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  })();
  const skillNames = Array.from(new Set(scores.map((s: any) => s.skill_categories?.name).filter(Boolean)));

  async function addScore(e: React.FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("test_scores").insert({
      student_id: id,
      skill_category_id: scoreForm.skill_category_id,
      score: Number(scoreForm.score),
      tested_at: scoreForm.tested_at,
      coach_id: u.user?.id,
      notes: scoreForm.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Đã lưu điểm test");
    setScoreOpen(false);
    setScoreForm({ skill_category_id: "", score: "", tested_at: new Date().toISOString().slice(0, 10), notes: "" });
    qc.invalidateQueries({ queryKey: ["scores", id] });
  }

  function buildZaloMessage() {
    if (!student) return "";
    const last = scores.slice(-5).reverse();
    const lines = last.map((s: any) => `• ${s.skill_categories?.name}: ${s.score} (${s.tested_at})`).join("\n");
    return `Kính gửi phụ huynh ${student.parent_name ?? ""},\n\nBáo cáo tiến bộ của ${student.full_name} tại BDC Basketball:\n${lines || "(Chưa có điểm test)"}\n\nTrân trọng,\nHLV BDC`;
  }

  function notifyParent() {
    if (!student?.parent_zalo_phone) return toast.error("Học viên chưa có SĐT Zalo của phụ huynh");
    const msg = buildZaloMessage();
    navigator.clipboard.writeText(msg).then(() => toast.success("Đã sao chép tin nhắn — Zalo đang mở"));
    const phone = String(student.parent_zalo_phone).replace(/\D/g, "");
    window.open(`https://zalo.me/${phone}`, "_blank");
  }

  async function getAiRecommendation() {
    if (!student) return;
    setAiLoading(true);
    setAiText("");
    const scoreSummary = scores.map((s: any) => `${s.skill_categories?.name} = ${s.score} (${s.tested_at})`).join("\n");
    try {
      const res = await generate({
        data: {
          type: "recommendation",
          target: `${student.full_name} (${student.level})`,
          extraContext: scoreSummary || "Chưa có dữ liệu test.",
          studentId: id,
        },
      });
      setAiText(res.content);
    } catch (e: any) {
      toast.error(e.message ?? "Lỗi gọi AI");
    }
    setAiLoading(false);
  }

  if (!student) return <div className="p-6">Đang tải…</div>;

  return (
    <>
      <PageHeader
        title={student.full_name}
        subtitle={`${student.level === "beginner" ? "Cơ bản" : student.level === "intermediate" ? "Trung cấp" : "Nâng cao"} · ${student.age ?? "?"} tuổi`}
        action={
          <div className="flex gap-2">
            <Link to="/students"><Button variant="outline"><ArrowLeft className="size-4" /> Danh sách</Button></Link>
            <Button onClick={notifyParent} variant="secondary"><MessageCircle className="size-4" /> Báo phụ huynh (Zalo)</Button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Phụ huynh</CardTitle></CardHeader><CardContent>{student.parent_name ?? "—"}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">SĐT Zalo</CardTitle></CardHeader><CardContent>{student.parent_zalo_phone ?? "—"}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Tổng lần test</CardTitle></CardHeader><CardContent className="font-display text-3xl">{scores.length}</CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Biểu đồ tiến bộ</CardTitle>
            <Dialog open={scoreOpen} onOpenChange={setScoreOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="size-4" /> Thêm điểm test</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Điểm test mới</DialogTitle></DialogHeader>
                <form onSubmit={addScore} className="space-y-3">
                  <div>
                    <Label>Kỹ năng</Label>
                    <Select value={scoreForm.skill_category_id} onValueChange={(v) => setScoreForm({ ...scoreForm, skill_category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn kỹ năng" /></SelectTrigger>
                      <SelectContent>{skills.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.unit})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Điểm</Label><Input required type="number" step="0.01" value={scoreForm.score} onChange={(e) => setScoreForm({ ...scoreForm, score: e.target.value })} /></div>
                    <div><Label>Ngày test</Label><Input required type="date" value={scoreForm.tested_at} onChange={(e) => setScoreForm({ ...scoreForm, tested_at: e.target.value })} /></div>
                  </div>
                  <div><Label>Ghi chú</Label><Input value={scoreForm.notes} onChange={(e) => setScoreForm({ ...scoreForm, notes: e.target.value })} /></div>
                  <Button type="submit" className="w-full">Lưu</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Chưa có dữ liệu test</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {skillNames.map((name, i) => (
                    <Line key={name as string} type="monotone" dataKey={name as string} stroke={`var(--chart-${(i % 5) + 1})`} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Gợi ý AI cho học viên</CardTitle>
            <Dialog open={aiOpen} onOpenChange={(v) => { setAiOpen(v); if (v && !aiText) getAiRecommendation(); }}>
              <DialogTrigger asChild><Button variant="secondary"><Sparkles className="size-4" /> Sinh gợi ý AI</Button></DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>Lộ trình AI đề xuất</DialogTitle></DialogHeader>
                {aiLoading ? <div className="py-12 text-center text-muted-foreground">Đang gọi AI…</div> : (
                  <>
                    <pre className="whitespace-pre-wrap text-sm max-h-[60vh] overflow-auto bg-muted p-4 rounded">{aiText || "—"}</pre>
                    <Button onClick={() => { navigator.clipboard.writeText(aiText); toast.success("Đã sao chép"); }} variant="outline" size="sm"><Copy className="size-4" /> Sao chép</Button>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
