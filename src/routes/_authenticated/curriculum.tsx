import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateCurriculumPart, saveCreation } from "@/lib/ai.functions";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Layers, Play, Square, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MarkdownReport } from "@/components/MarkdownReport";

export const Route = createFileRoute("/_authenticated/curriculum")({ component: CurriculumPage });

const LEVELS = [
  { value: "Cơ bản (Beginner)", label: "Cơ bản — Người mới" },
  { value: "Trung cấp (Intermediate)", label: "Trung cấp" },
  { value: "Nâng cao (Advanced)", label: "Nâng cao" },
];

function CurriculumPage() {
  const generate = useServerFn(generateCurriculumPart);
  const save = useServerFn(saveCreation);
  const creationIdRef = useRef<string | undefined>(undefined);
  const [level, setLevel] = useState(LEVELS[0].value);
  const [weeks, setWeeks] = useState(8);
  const [spw, setSpw] = useState(2);
  const [extra, setExtra] = useState("");

  const [design, setDesign] = useState("");
  const [designLoading, setDesignLoading] = useState(false);
  const [weekTexts, setWeekTexts] = useState<Record<number, string>>({});
  const [busyWeek, setBusyWeek] = useState<number | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const cancelRef = useRef(false);

  const params = () => ({ target: level, weeks, sessionsPerWeek: spw, extraContext: extra });

  function buildCombined(designText: string, map: Record<number, string>) {
    const ws = Array.from({ length: weeks }, (_, i) => i + 1).filter((w) => map[w]);
    return (
      designText +
      (ws.length ? "\n\n# GIÁO ÁN CHI TIẾT TỪNG TUẦN\n\n" + ws.map((w) => `## TUẦN ${w}\n\n${map[w]}`).join("\n\n") : "")
    );
  }

  // Auto-save the assembled program into My Creations (one evolving entry).
  async function autosave(designText: string, map: Record<number, string>) {
    try {
      const r = await save({
        data: { id: creationIdRef.current, kind: "curriculum", title: `Giáo án ${weeks} tuần — ${level}`, content: buildCombined(designText, map), meta: { level, weeks, spw } },
      });
      creationIdRef.current = r.id;
    } catch {
      /* non-blocking */
    }
  }

  async function makeDesign() {
    setDesignLoading(true);
    setDesign("");
    setWeekTexts({});
    creationIdRef.current = undefined; // new program → new creation
    try {
      const res = await generate({ data: { scope: "design", ...params() } });
      setDesign(res.content);
      await autosave(res.content, {});
    } catch (e: any) {
      toast.error(e.message ?? "Lỗi AI");
    }
    setDesignLoading(false);
  }

  async function makeWeek(w: number) {
    if (!design) return toast.error("Hãy tạo khung chương trình trước.");
    setBusyWeek(w);
    try {
      const res = await generate({
        data: { scope: "week", week: w, designContext: design.slice(0, 12000), ...params() },
      });
      let newMap: Record<number, string> = {};
      setWeekTexts((prev) => {
        newMap = { ...prev, [w]: res.content };
        return newMap;
      });
      await autosave(design, newMap);
    } catch (e: any) {
      toast.error(`Tuần ${w}: ${e.message ?? "Lỗi AI"}`);
      throw e;
    } finally {
      setBusyWeek(null);
    }
  }

  async function makeAll() {
    if (!design) return;
    cancelRef.current = false;
    setRunningAll(true);
    for (let w = 1; w <= weeks; w++) {
      if (cancelRef.current) break;
      if (weekTexts[w]) continue; // skip already-generated weeks
      try {
        await makeWeek(w);
      } catch {
        break; // stop the chain on first error
      }
    }
    setRunningAll(false);
  }

  function stopAll() {
    cancelRef.current = true;
  }

  const doneWeeks = Object.keys(weekTexts).length;
  const combined =
    design +
    (doneWeeks > 0
      ? "\n\n# GIÁO ÁN CHI TIẾT TỪNG TUẦN\n\n" +
        Array.from({ length: weeks }, (_, i) => i + 1)
          .filter((w) => weekTexts[w])
          .map((w) => `## TUẦN ${w}\n\n${weekTexts[w]}`)
          .join("\n\n")
      : "");

  return (
    <>
      <PageHeader title="Soạn giáo án AI" subtitle="Tạo khung → soạn từng tuần (riêng lẻ hoặc liên tục) → ghép thành 1 bản PDF" />
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
                <Label>Số buổi/tuần</Label>
                <Input type="number" min={1} max={7} value={spw} onChange={(e) => setSpw(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} />
              </div>
            </div>
            <div>
              <Label>Ghi chú bổ sung (tùy chọn)</Label>
              <Textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="VD: nhóm 12 học viên, sân nhỏ, ưu tiên ném rổ…" />
            </div>
            <Button onClick={makeDesign} disabled={designLoading} className="w-full">
              <Layers className="size-4" /> {designLoading ? "Đang tạo khung…" : design ? "Tạo lại khung" : "Tạo khung chương trình"}
            </Button>
            {design && (
              <div className="pt-1 space-y-2">
                <div className="flex gap-2">
                  {!runningAll ? (
                    <Button size="sm" variant="secondary" className="flex-1" onClick={makeAll} disabled={busyWeek !== null}>
                      <Play className="size-4" /> Tạo tất cả các tuần
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" className="flex-1" onClick={stopAll}>
                      <Square className="size-4" /> Dừng
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{doneWeeks}/{weeks} tuần đã soạn. Mỗi tuần là một lần gọi ngắn — nhanh hơn nhiều so với tạo cả khóa một lần.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          {!design && !designLoading && (
            <Card><CardContent className="py-16 text-center text-muted-foreground">Chọn cấu hình và bấm "Tạo khung chương trình" để bắt đầu.</CardContent></Card>
          )}
          {designLoading && (
            <Card><CardContent className="py-16 text-center text-muted-foreground">AI đang dựng khung chương trình…</CardContent></Card>
          )}

          {design && (
            <Card>
              <CardHeader><CardTitle className="font-display">Khung chương trình — {level}</CardTitle></CardHeader>
              <CardContent><MarkdownReport title={`Khung chương trình — ${level}`} content={design} /></CardContent>
            </Card>
          )}

          {design && (
            <Card>
              <CardHeader><CardTitle className="font-display">Giáo án theo tuần</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => {
                  const text = weekTexts[w];
                  const busy = busyWeek === w;
                  return (
                    <div key={w} className="border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Tuần {w}</span>
                          {busy ? (
                            <Badge variant="secondary" className="gap-1"><Loader2 className="size-3 animate-spin" /> Đang soạn…</Badge>
                          ) : text ? (
                            <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3 text-green-600" /> Xong</Badge>
                          ) : (
                            <Badge variant="outline">Chưa soạn</Badge>
                          )}
                        </div>
                        <Button size="sm" variant={text ? "outline" : "default"} disabled={busy || runningAll} onClick={() => makeWeek(w)}>
                          {text ? <><RefreshCw className="size-3" /> Soạn lại</> : <><Sparkles className="size-3" /> Soạn tuần này</>}
                        </Button>
                      </div>
                      {text && <div className="mt-3"><MarkdownReport title={`Tuần ${w} — ${level}`} content={text} /></div>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {design && doneWeeks > 0 && (
            <Card>
              <CardHeader><CardTitle className="font-display">Toàn bộ chương trình (ghép khung + các tuần đã soạn)</CardTitle></CardHeader>
              <CardContent><MarkdownReport title={`Giáo án ${weeks} tuần — ${level}`} content={combined} /></CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
