import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/students/")({ component: StudentsPage });

const LEVELS = [
  { value: "beginner", label: "Cơ bản" },
  { value: "intermediate", label: "Trung cấp" },
  { value: "advanced", label: "Nâng cao" },
];

function StudentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", age: "", level: "beginner", parent_name: "", parent_zalo_phone: "" });

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("students").insert({
      full_name: form.full_name,
      age: form.age ? Number(form.age) : null,
      level: form.level as any,
      parent_name: form.parent_name || null,
      parent_zalo_phone: form.parent_zalo_phone || null,
      assigned_coach_id: u.user?.id,
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Đã thêm học viên");
    setOpen(false);
    setForm({ full_name: "", age: "", level: "beginner", parent_name: "", parent_zalo_phone: "" });
    qc.invalidateQueries({ queryKey: ["students"] });
  }

  return (
    <>
      <PageHeader
        title="Học viên"
        subtitle={`${students.length} học viên`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><UserPlus className="size-4" /> Thêm học viên</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Học viên mới</DialogTitle></DialogHeader>
              <form onSubmit={addStudent} className="space-y-3">
                <div><Label>Họ và tên</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tuổi</Label><Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></div>
                  <div>
                    <Label>Trình độ</Label>
                    <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Tên phụ huynh</Label><Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
                <div><Label>SĐT Zalo phụ huynh</Label><Input value={form.parent_zalo_phone} onChange={(e) => setForm({ ...form, parent_zalo_phone: e.target.value })} placeholder="VD: 0901234567" /></div>
                <Button type="submit" className="w-full"><Plus className="size-4" /> Lưu</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Tuổi</TableHead>
                  <TableHead>Trình độ</TableHead>
                  <TableHead>Phụ huynh</TableHead>
                  <TableHead>Zalo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>{s.age ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{LEVELS.find((l) => l.value === s.level)?.label ?? s.level}</Badge></TableCell>
                    <TableCell>{s.parent_name ?? "—"}</TableCell>
                    <TableCell>{s.parent_zalo_phone ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link to="/students/$id" params={{ id: s.id }}><Button size="sm" variant="ghost">Chi tiết →</Button></Link>
                    </TableCell>
                  </TableRow>
                ))}
                {students.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Chưa có học viên — bấm "Thêm học viên" để bắt đầu.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
