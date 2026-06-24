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
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MarkdownReport } from "@/components/MarkdownReport";

export const Route = createFileRoute("/_authenticated/tryouts")({ component: TryoutsPage });

const AGES = ["U10", "U11", "U12", "U13", "U14", "U15"];
const LEVELS = ["Mới làm quen", "Phong trào", "Năng khiếu", "Tuyển chọn Elite"];
const FOCUS = ["Thể chất", "Kỹ năng", "Ném rổ", "Tâm lý"];

function TryoutsPage() {
  const generate = useServerFn(generateWithKieAi);
  const save = useServerFn(saveCreation);
  const [age, setAge] = useState(AGES[0]);
  const [level, setLevel] = useState(LEVELS[2]);
  const [numStudents, setNumStudents] = useState(30);
  const [durationMins, setDurationMins] = useState(120);
  const [focus, setFocus] = useState<string[]>(["Kỹ năng", "Thể chất"]);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const toggleFocus = (f: string) =>
    setFocus((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  async function go() {
    if (focus.length === 0) return toast.error("Chọn ít nhất 1 trọng tâm.");
    setLoading(true);
    setResult("");
    try {
      const res = await generate({
        data: { type: "tryout", target: age, level, numStudents, durationMins, focus, extraContext: extra },
      });
      setResult(res.content);
      try {
        await save({
          data: { kind: "tryout", title: `Try-out ${age} (${level}) — ${focus.join(", ")}`, content: res.content, meta: { age, level, numStudents, durationMins, focus } },
        });
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
      <PageHeader title="Try-out Elite" subtitle="Claude kết hợp thư viện sách BDC + phương pháp để thiết kế phương án tuyển chọn" />
      <div className="p-6 grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 h-fit">
          <CardHeader><CardTitle className="font-display">Thông số tuyển chọn</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nhóm tuổi</Label>
                <Select value={age} onValueChange={setAge}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AGES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trình độ</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Số ứng viên</Label>
                <Input type="number" min={1} max={200} value={numStudents} onChange={(e) => setNumStudents(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
              </div>
              <div>
                <Label>Thời lượng (phút)</Label>
                <Input type="number" min={15} max={600} step={15} value={durationMins} onChange={(e) => setDurationMins(Math.max(15, Math.min(600, Number(e.target.value) || 15)))} />
              </div>
            </div>
            <div>
              <Label>Trọng tâm đánh giá</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {FOCUS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFocus(f)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${focus.includes(f) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground/80"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Ghi chú (tùy chọn)</Label>
              <Textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="VD: sân Cần Thơ, 2 HLV chấm…" />
            </div>
            <Button onClick={go} disabled={loading} className="w-full">
              <Sparkles className="size-4" /> {loading ? "Đang thiết kế…" : "Thiết kế phương án try-out"}
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="font-display">Phương án {age}</CardTitle></CardHeader>
          <CardContent>
            {!result && !loading && <div className="text-center text-muted-foreground py-16">Nhập thông số và bấm "Thiết kế phương án try-out".</div>}
            {loading && <div className="text-center text-muted-foreground py-16">AI đang thiết kế try-out (kết hợp tài liệu thư viện)…</div>}
            {result && <MarkdownReport title={`Try-out ${age} (${level})`} content={result} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
