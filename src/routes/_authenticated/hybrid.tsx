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
import { Blend } from "lucide-react";
import { toast } from "sonner";
import { MarkdownReport } from "@/components/MarkdownReport";

export const Route = createFileRoute("/_authenticated/hybrid")({ component: HybridPage });

const LEVELS = [
  { value: "Cơ bản (Beginner)", label: "Cơ bản — Người mới" },
  { value: "Trung cấp (Intermediate)", label: "Trung cấp" },
  { value: "Nâng cao (Advanced)", label: "Nâng cao" },
];

function HybridPage() {
  const generate = useServerFn(generateWithKieAi);
  const save = useServerFn(saveCreation);
  const [level, setLevel] = useState(LEVELS[0].value);
  const [weeks, setWeeks] = useState(8);
  const [spw, setSpw] = useState(3);
  const [pb, setPb] = useState(60);
  const ps = 100 - pb;
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function go() {
    setLoading(true);
    setResult("");
    try {
      const res = await generate({
        data: { type: "hybrid", target: level, weeks, sessionsPerWeek: spw, pctBasketball: pb, pctStrength: ps, extraContext: extra },
      });
      setResult(res.content);
      try {
        await save({ data: { kind: "hybrid", title: `Hybrid ${pb}% bóng rổ / ${ps}% S&C — ${level}`, content: res.content, meta: { level, weeks, spw, pctBasketball: pb, pctStrength: ps } } });
        toast.success("Đã lưu vào My Creations");
      } catch {
        /* keep showing result even if save fails */
      }
    } catch (e: any) {
      toast.error(e.message ?? "Lỗi AI");
    }
    setLoading(false);
  }

  return (
    <>
      <PageHeader title="Chương trình Hybrid (Bóng rổ + Thể lực)" subtitle="Tự chọn tỉ lệ bóng rổ / S&C — tự động lưu vào My Creations" />
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
                <Label>Buổi/tuần</Label>
                <Input type="number" min={1} max={7} value={spw} onChange={(e) => setSpw(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} />
              </div>
            </div>
            <div>
              <Label>Tỉ lệ cấu trúc chương trình</Label>
              <input type="range" min={0} max={100} step={5} value={pb} onChange={(e) => setPb(Number(e.target.value))} className="w-full accent-primary" />
              <div className="flex justify-between text-sm mt-1">
                <span className="font-semibold text-primary">Bóng rổ {pb}%</span>
                <span className="font-semibold">{ps}% Thể lực (S&C)</span>
              </div>
            </div>
            <div>
              <Label>Ghi chú (tùy chọn)</Label>
              <Textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="VD: ưu tiên sức bật, mùa giải sắp tới…" />
            </div>
            <Button onClick={go} disabled={loading} className="w-full">
              <Blend className="size-4" /> {loading ? "Đang soạn…" : "Sinh chương trình Hybrid"}
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="font-display">Kết quả</CardTitle></CardHeader>
          <CardContent>
            {!result && !loading && <div className="text-center text-muted-foreground py-16">Đặt tỉ lệ bóng rổ / thể lực rồi bấm "Sinh chương trình Hybrid".</div>}
            {loading && <div className="text-center text-muted-foreground py-16">AI đang soạn chương trình kết hợp…</div>}
            {result && <MarkdownReport title={`Hybrid ${pb}/${ps} — ${level}`} content={result} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
