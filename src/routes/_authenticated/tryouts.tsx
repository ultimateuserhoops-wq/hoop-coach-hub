import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithKieAi } from "@/lib/ai.functions";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tryouts")({ component: TryoutsPage });

const AGES = ["U10", "U11", "U12", "U13", "U14", "U15"];

function TryoutsPage() {
  const generate = useServerFn(generateWithKieAi);
  const [age, setAge] = useState("U10");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function go() {
    setLoading(true); setResult("");
    try {
      const res = await generate({ data: { type: "tryout", target: age, extraContext: extra } });
      setResult(res.content);
    } catch (e: any) { toast.error(e.message ?? "Lỗi AI"); }
    setLoading(false);
  }

  return (
    <>
      <PageHeader title="Try-out Elite" subtitle="Thiết kế phương án tuyển chọn lớp năng khiếu theo nhóm tuổi" />
      <div className="p-6 grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="font-display">Nhóm tuổi</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {AGES.map((a) => (
                <Button key={a} type="button" variant={age === a ? "default" : "outline"} onClick={() => setAge(a)}>{a}</Button>
              ))}
            </div>
            <div>
              <Label>Ghi chú thêm</Label>
              <Textarea rows={5} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="VD: 30 ứng viên, sân Cần Thơ, 1 buổi 3h…" />
            </div>
            <Button onClick={go} disabled={loading} className="w-full"><Sparkles className="size-4" /> {loading ? "Đang sinh…" : "Sinh phương án try-out"}</Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Phương án {age}</CardTitle>
            {result && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result); toast.success("Đã sao chép"); }}><Copy className="size-4" /></Button>}
          </CardHeader>
          <CardContent>
            {!result && !loading && <div className="text-center text-muted-foreground py-16">Chọn nhóm tuổi và bấm sinh phương án.</div>}
            {loading && <div className="text-center text-muted-foreground py-16">AI đang thiết kế try-out…</div>}
            {result && <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded max-h-[70vh] overflow-auto">{result}</pre>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
