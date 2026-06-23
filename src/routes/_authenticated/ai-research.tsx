import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithKieAi } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Globe } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ai-research")({ component: AiResearchPage });

const AGES = ["U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "Senior"];
const LEVELS = ["Beginner", "Intermediate", "Advanced", "Elite"];

type Doc = { id: string; title: string };

function AiResearchPage() {
  const generate = useServerFn(generateWithKieAi);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [testName, setTestName] = useState("");
  const [age, setAge] = useState("U12");
  const [level, setLevel] = useState("Intermediate");
  const [extra, setExtra] = useState("");
  const [useWeb, setUseWeb] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("library_documents")
        .select("id,title")
        .eq("ingest_status", "done")
        .order("created_at", { ascending: false });
      if (error) { toast.error("Không tải được thư viện"); return; }
      const list = (data ?? []) as Doc[];
      setDocs(list);
      setSelected(new Set(list.map((d) => d.id)));
    })();
  }, []);

  const allSelected = useMemo(() => docs.length > 0 && selected.size === docs.length, [docs, selected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(docs.map((d) => d.id)));
  }

  async function go() {
    if (selected.size === 0 && !useWeb) {
      toast.error("Hãy chọn ít nhất một tài liệu hoặc bật 'Kết hợp web research'.");
      return;
    }
    setLoading(true); setResult("");
    try {
      const titles = docs.filter((d) => selected.has(d.id)).map((d) => d.title);
      const res = await generate({
        data: {
          type: "research",
          target: age,
          level,
          extraContext: extra || undefined,
          testName: testName || undefined,
          selectedSourceTitles: titles,
          useWebResearch: useWeb,
        },
      });
      setResult(res.content);
    } catch (e: any) {
      toast.error(e.message ?? "Lỗi AI");
    }
    setLoading(false);
  }

  return (
    <>
      <PageHeader title="AI Research" subtitle="Thiết kế bài kiểm tra đánh giá dựa trên thư viện BDC + kiến thức web" />
      <div className="p-6 grid lg:grid-cols-3 gap-6">
        {/* Sources */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="font-display text-base flex items-center gap-2">
              SELECT SOURCES <Badge variant="secondary">{selected.size} đã chọn</Badge>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={toggleAll} disabled={docs.length === 0}>
              {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </Button>
          </CardHeader>
          <CardContent>
            {docs.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Chưa có tài liệu nào sẵn sàng trong thư viện. Hãy tải lên ở trang Thư viện.
              </div>
            ) : (
              <ScrollArea className="h-[420px] pr-3">
                <ul className="space-y-2">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <label className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={selected.has(d.id)}
                          onCheckedChange={() => toggleOne(d.id)}
                          className="mt-0.5"
                        />
                        <span className="text-sm leading-snug">{d.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Config + Result */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">TEST CONFIGURATION</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tên bài kiểm tra</Label>
                <Input
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="Để trống để Claude tự đặt tên"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nhóm tuổi</Label>
                  <Select value={age} onValueChange={setAge}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AGES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Trình độ</Label>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Hướng dẫn bổ sung</Label>
                <Textarea
                  rows={4}
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="VD: tập trung vào kỹ năng phòng thủ, thời lượng 90 phút…"
                />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="size-4 text-primary" /> Kết hợp với Web Research
                  </div>
                  {useWeb && (
                    <p className="text-xs text-muted-foreground">
                      AI sẽ kết hợp tài liệu thư viện + kiến thức web cập nhật nhất
                    </p>
                  )}
                </div>
                <Switch checked={useWeb} onCheckedChange={setUseWeb} />
              </div>
              <Button onClick={go} disabled={loading} className="w-full" size="lg">
                <Sparkles className="size-4" /> {loading ? "Đang sinh bài kiểm tra…" : "Generate Test with Claude"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display text-base">Kết quả</CardTitle>
              {result && (
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result); toast.success("Đã sao chép"); }}>
                  <Copy className="size-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!result && !loading && (
                <div className="text-center text-muted-foreground py-12 text-sm">
                  Cấu hình bài kiểm tra rồi bấm Generate.
                </div>
              )}
              {loading && (
                <div className="text-center text-muted-foreground py-12 text-sm">
                  Claude đang nghiên cứu tài liệu và thiết kế bài kiểm tra…
                </div>
              )}
              {result && (
                <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded max-h-[70vh] overflow-auto">{result}</pre>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
