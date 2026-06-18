import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const { isAdmin, loading } = useRoles();
  const [vals, setVals] = useState({ kie_ai_api_key: "", kie_ai_base_url: "", kie_ai_model: "", kie_ai_embedding_model: "" });

  const { data: settings } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*")).data ?? [],
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!settings) return;
    const map: any = Object.fromEntries(settings.map((s: any) => [s.key, s.value]));
    setVals({
      kie_ai_api_key: map.kie_ai_api_key ?? "",
      kie_ai_base_url: map.kie_ai_base_url ?? "",
      kie_ai_model: map.kie_ai_model ?? "",
      kie_ai_embedding_model: map.kie_ai_embedding_model ?? "text-embedding-3-small",
    });
  }, [settings]);

  async function save() {
    const { data: u } = await supabase.auth.getUser();
    const rows = Object.entries(vals).map(([key, value]) => ({ key, value, updated_by: u.user?.id, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Đã lưu cài đặt");
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  if (loading) return <div className="p-6">Đang tải…</div>;
  if (!isAdmin) return <div className="p-6 text-muted-foreground">Chỉ Admin mới truy cập được trang Cài đặt.</div>;

  const isPlaceholder = vals.kie_ai_api_key === "PLACEHOLDER_REPLACE_ME" || !vals.kie_ai_api_key;

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Cấu hình tích hợp AI kie.ai" />
      <div className="p-6 max-w-2xl space-y-6">
        {isPlaceholder && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>API key đang là PLACEHOLDER</AlertTitle>
            <AlertDescription>Các tính năng AI sẽ báo lỗi cho đến khi bạn nhập API key thật của kie.ai bên dưới.</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader><CardTitle className="font-display">Tích hợp kie.ai</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>API Key</Label>
              <Input type="password" value={vals.kie_ai_api_key} onChange={(e) => setVals({ ...vals, kie_ai_api_key: e.target.value })} placeholder="sk-…" />
              <p className="text-xs text-muted-foreground mt-1">Lấy tại trang quản trị kie.ai của bạn. Khóa được lưu mã hóa trên Lovable Cloud.</p>
            </div>
            <div>
              <Label>Base URL</Label>
              <Input value={vals.kie_ai_base_url} onChange={(e) => setVals({ ...vals, kie_ai_base_url: e.target.value })} placeholder="https://api.kie.ai/v1" />
            </div>
            <div>
              <Label>Model chat (sinh giáo án / try-out)</Label>
              <Input value={vals.kie_ai_model} onChange={(e) => setVals({ ...vals, kie_ai_model: e.target.value })} placeholder="opus-4.8" />
            </div>
            <div>
              <Label>Model embedding (RAG thư viện)</Label>
              <Input value={vals.kie_ai_embedding_model} onChange={(e) => setVals({ ...vals, kie_ai_embedding_model: e.target.value })} placeholder="text-embedding-3-small" />
              <p className="text-xs text-muted-foreground mt-1">Phải trả về vector 1536 chiều. Khi đổi model, bấm "Lập lại chỉ mục" cho từng tài liệu trong Thư viện.</p>
            </div>
            <Button onClick={save}><Save className="size-4" /> Lưu cài đặt</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
