import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { MarkdownReport } from "@/components/MarkdownReport";

export const Route = createFileRoute("/_authenticated/creations")({ component: CreationsPage });

const KIND_LABEL: Record<string, string> = {
  curriculum: "Giáo án",
  strength: "Thể lực",
  hybrid: "Hybrid",
  tryout: "Try-out",
};
const KINDS = ["all", "curriculum", "strength", "hybrid", "tryout"];

function CreationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: items = [] } = useQuery({
    queryKey: ["creations"],
    queryFn: async () =>
      (await supabase.from("creations").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function remove(id: string) {
    if (!confirm("Xóa chương trình này khỏi My Creations?")) return;
    await supabase.from("creations").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["creations"] });
    toast.success("Đã xóa");
  }

  const shown = filter === "all" ? items : items.filter((c: any) => c.kind === filter);

  return (
    <>
      <PageHeader title="My Creations" subtitle="Mọi chương trình bạn tạo được lưu tự động tại đây" />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground/80"}`}
            >
              {k === "all" ? "Tất cả" : KIND_LABEL[k] ?? k}
            </button>
          ))}
        </div>

        {shown.length === 0 && (
          <div className="text-center text-muted-foreground py-20">
            <FolderOpen className="size-8 mx-auto mb-2 opacity-50" />
            Chưa có chương trình nào. Tạo giáo án, S&C, Hybrid hoặc Try-out — sẽ tự động lưu vào đây.
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="secondary">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("vi-VN")}</span>
                </div>
                <div className="font-semibold leading-snug line-clamp-2 min-h-[2.5rem]">{c.title}</div>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild><Button size="sm" variant="outline" className="flex-1">Mở</Button></DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader><DialogTitle>{c.title}</DialogTitle></DialogHeader>
                      <MarkdownReport title={c.title} content={c.content} />
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
