import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithKieAi } from "@/lib/ai.functions";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/curriculum")({ component: CurriculumPage });

const LEVELS = [
  { value: "Cơ bản (Beginner)", label: "Cơ bản — Người mới" },
  { value: "Trung cấp (Intermediate)", label: "Trung cấp" },
  { value: "Nâng cao (Advanced)", label: "Nâng cao" },
];

function CurriculumPage() {
  const generate = useServerFn(generateWithKieAi);
  const [level, setLevel] = useState(LEVELS[0].value);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function go() {
    setLoading(true); setResult("");
    try {
      const res = await generate({ data: { type: "curriculum", target: level, extraContext: extra } });
      setResult(res.content);
    } catch (e: any) { toast.error(e.message ?? "Lỗi AI"); }
    setLoading(false);
  }

  return (
    <>
      <PageHeader title="Soạn giáo án AI" subtitle="Mô hình kie.ai Opus 4.8 · RAG từ thư viện BDC" />
      <div className="p-6 grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="font-display">Cấu hình</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Trình độ học viên</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ghi chú bổ sung (tùy chọn)</Label>
              <Textarea rows={5} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="VD: nhóm 12 học viên, tập 2 buổi/tuần, sân nhỏ…" />
            </div>
            <Button onClick={go} disabled={loading} className="w-full">
              <Sparkles className="size-4" /> {loading ? "Đang sinh…" : "Sinh giáo án"}
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Kết quả</CardTitle>
            {result && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result); toast.success("Đã sao chép"); }}><Copy className="size-4" /> Sao chép</Button>}
          </CardHeader>
          <CardContent>
            {!result && !loading && <div className="text-center text-muted-foreground py-16">Chọn trình độ và bấm "Sinh giáo án".</div>}
            {loading && <div className="text-center text-muted-foreground py-16">AI đang soạn giáo án…</div>}
            {result && <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded max-h-[70vh] overflow-auto">{result}</pre>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
