import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileText, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library")({ component: LibraryPage });

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
  });

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Chọn tệp");
    setUploading(true);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("library").upload(path, file);
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("library_documents").insert({
      title: form.title || file.name,
      description: form.description || null,
      storage_path: path,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: u.user?.id,
    });
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Đã upload");
    setOpen(false);
    setForm({ title: "", description: "" });
    qc.invalidateQueries({ queryKey: ["library"] });
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
        subtitle="Sách, tài liệu HLV — AI sẽ tham chiếu khi sinh giáo án"
        action={isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Upload className="size-4" /> Tải lên</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tài liệu mới</DialogTitle></DialogHeader>
              <form onSubmit={upload} className="space-y-3">
                <div><Label>Tệp (PDF, DOCX, …)</Label><Input ref={fileRef} type="file" required /></div>
                <div><Label>Tiêu đề</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Mặc định: tên tệp" /></div>
                <div><Label>Mô tả ngắn (AI dùng làm ngữ cảnh)</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <Button type="submit" disabled={uploading} className="w-full">{uploading ? "Đang upload…" : "Tải lên"}</Button>
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
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => download(d.storage_path, d.title)}><Download className="size-3" /> Tải</Button>
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
