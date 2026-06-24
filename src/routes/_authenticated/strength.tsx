import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithKieAi, saveCreation } from "@/lib/ai.functions";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { MarkdownReport } from "@/components/MarkdownReport";

export const Route = createFileRoute("/_authenticated/strength")({ component: StrengthPage });

const LEVELS = [
  { value: "Cơ bản (Beginner)", label: "Cơ bản — Người mới" },
  { value: "Trung cấp (Intermediate)", label: "Trung cấp" },
  { value: "Nâng cao (Advanced)", label: "Nâng cao" },
];

function StrengthPage() {
  const generate = useServerFn(generateWithKieAi);
  const save = useServerFn(saveCreation);
  const [level, setLevel] = useState(LEVELS[0].value);
  const [weeks, setWeeks] = useState(8);
  const [spw, setSpw] = useState(3);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function go() {
    setLoading(true);
    setResult("");
    try {
      const res = await generate({ data: { type: "strength", target: level, weeks, sessionsPerWeek: spw, extraContext: extra } });
      setResult(res.content);
      try {
        await save({ data: { kind: "strength", title: `Thể lực & Sức mạnh — ${level}`, content: res.content, meta: { level, weeks, spw } } });
        toast.success("Đã lưu vào My Creations");
      } catch {
        /* generation still shown even if save fails */
      }
    } catch (e: any) {
      toast.error(e.message ?? "Lỗi AI");
    }
    setLoading(false);
  }

  return (
    <>
      <PageHeader title="Chương trình Thể lực & Sức mạnh" subtitle="S&C chuyên biệt cho bóng rổ — tự động lưu vào My Creations" />
      <div className="p-6 grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 h-fit">
          <CardHeader><CardTitle className="font-display">Cấu hình</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Trình độ học viên</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Số tuần</Label>
                <Input type="number" min={1} max={24} value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} />
              </div>
              <div>
                <Label>Buổi S&C/tuần</Label>
                <Input type="number" min={1} max={7} value={spw} onChange={(e) => setSpw(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} />
              </div>
            </div>
            <div>
              <Label>Ghi chú (tùy chọn)</Label>
              <Textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="VD: thiếu tạ, tập sân, nhấn sức bật…" />
            </div>
            <Button onClick={go} disabled={loading} className="w-full">
              <Dumbbell className="size-4" /> {loading ? "Đang soạn…" : "Sinh chương trình S&C"}
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="font-display">Kết quả</CardTitle></CardHeader>
          <CardContent>
            {!result && !loading && <div className="text-center text-muted-foreground py-16">Chọn cấu hình và bấm "Sinh chương trình S&C".</div>}
            {loading && <div className="text-center text-muted-foreground py-16">AI đang soạn chương trình thể lực…</div>}
            {result && <MarkdownReport title={`Chương trình S&C — ${level}`} content={result} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
