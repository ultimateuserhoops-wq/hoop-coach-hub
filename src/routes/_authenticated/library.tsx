import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileText, Download, Trash2, RefreshCw, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library")({ component: LibraryPage });

function StatusBadge({ status, chunkCount, error }: { status?: string; chunkCount?: number; error?: string | null }) {
  if (status === "done") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="size-3 text-green-600" /> Sẵn sàng · {chunkCount ?? 0} đoạn
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> Đang xử lý…
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1" title={error ?? undefined}>
        <AlertCircle className="size-3" /> Lỗi
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="size-3" /> Chờ xử lý
    </Badge>
  );
}

function LibraryPage() {
  const qc = useQueryClient();
  const { isAdmin } = useRoles();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["library"],
    queryFn: async () => (await supabase.from("library_documents").select("*").order("created_at", { ascending: false })).data ?? [],
    refetchInterval: 5000, // poll while ingestion runs
  });

  // Realtime updates on status changes
  useEffect(() => {
    const ch = supabase
      .channel("library_documents_status")
      .on("postgres_changes", { event: "*", schema: "public", table: "library_documents" }, () => {
        qc.invalidateQueries({ queryKey: ["library"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function ingest(documentId: string) {
    const { error } = await supabase.functions.invoke("ingest-library-doc", {
      body: { document_id: documentId },
    });
    if (error) {
      // Don't block — server will mark failed
      console.error(error);
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Chọn tệp");
    setUploading(true);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("library").upload(path, file);
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data: u } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase.from("library_documents").insert({
      title: form.title || file.name,
      description: form.description || null,
      storage_path: path,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: u.user?.id,
      ingest_status: "pending",
    }).select("id").single();
    setUploading(false);
    if (error || !inserted) return toast.error(error?.message ?? "Lỗi lưu metadata");
    toast.success("Đã upload, đang xử lý ngữ nghĩa…");
    setOpen(false);
    setForm({ title: "", description: "" });
    qc.invalidateQueries({ queryKey: ["library"] });
    // Fire and forget — status updates via realtime/polling
    ingest(inserted.id);
  }

  async function reindex(id: string) {
    await supabase.from("library_documents").update({ ingest_status: "pending", ingest_error: null }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["library"] });
    toast.info("Đã yêu cầu lập lại chỉ mục");
    ingest(id);
  }

  async function download(path: string, title: string) {
    const { data, error } = await supabase.storage.from("library").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Không tải được");
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = title;
    a.click();
  }

  async function remove(id: string, path: string) {
    if (!confirm("Xóa tài liệu này?")) return;
    await supabase.storage.from("library").remove([path]);
    await supabase.from("library_documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  return (
    <>
      <PageHeader
        title="Thư viện chuyên môn"
        subtitle="Sách & tài liệu HLV — AI tìm theo NGỮ NGHĨA trong nội dung sách khi sinh giáo án"
        action={isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Upload className="size-4" /> Tải lên</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tài liệu mới</DialogTitle></DialogHeader>
              <form onSubmit={upload} className="space-y-3">
                <div><Label>Tệp (PDF, TXT, MD)</Label><Input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" required /></div>
                <div><Label>Tiêu đề</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Mặc định: tên tệp" /></div>
                <div><Label>Mô tả ngắn</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground">Sau khi tải lên, hệ thống sẽ tự động trích xuất văn bản, chia đoạn và tạo vector ngữ nghĩa để AI tham chiếu.</p>
                <Button type="submit" disabled={uploading} className="w-full">{uploading ? "Đang upload…" : "Tải lên & lập chỉ mục"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <div className="p-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map((d: any) => (
          <Card key={d.id}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-lg bg-accent flex items-center justify-center shrink-0"><FileText className="size-5 text-primary" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{d.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{d.description ?? "—"}</div>
                  <div className="mt-2">
                    <StatusBadge status={d.ingest_status} chunkCount={d.chunk_count} error={d.ingest_error} />
                  </div>
                  {d.ingest_status === "failed" && d.ingest_error && (
                    <div className="text-xs text-destructive mt-1 line-clamp-2">{d.ingest_error}</div>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => download(d.storage_path, d.title)}><Download className="size-3" /> Tải</Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => reindex(d.id)} disabled={d.ingest_status === "processing"}>
                        <RefreshCw className="size-3" /> Lập lại chỉ mục
                      </Button>
                    )}
                    {isAdmin && <Button size="sm" variant="ghost" onClick={() => remove(d.id, d.storage_path)}><Trash2 className="size-3" /></Button>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {docs.length === 0 && <div className="md:col-span-2 lg:col-span-3 text-center text-muted-foreground py-16">Chưa có tài liệu.</div>}
      </div>
    </>
  );
}
