import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Dumbbell } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Đăng nhập — BDC" }, { name: "description", content: "Đăng nhập hệ thống quản lý chuyên môn BDC Basketball." }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Đăng nhập thành công");
    navigate({ to: "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Tạo tài khoản thành công. Vui lòng đăng nhập.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 court-bg court-lines">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6 text-court-foreground">
          <div className="size-12 rounded-xl bg-primary flex items-center justify-center font-display text-2xl text-primary-foreground">B</div>
          <div>
            <div className="font-display text-2xl">BDC Basketball</div>
            <div className="text-xs text-court-foreground/60">Phần mềm hỗ trợ chuyên môn</div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Chào mừng HLV</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Đăng nhập</TabsTrigger>
                <TabsTrigger value="signup">Đăng ký</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-3 mt-4">
                <form onSubmit={signIn} className="space-y-3">
                  <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label>Mật khẩu</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" disabled={loading} className="w-full"><Dumbbell className="size-4" /> Đăng nhập</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 mt-4">
                <form onSubmit={signUp} className="space-y-3">
                  <div><Label>Họ và tên</Label><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                  <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label>Mật khẩu</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" disabled={loading} className="w-full">Tạo tài khoản</Button>
                  <p className="text-xs text-muted-foreground">HLV đầu tiên đăng ký sẽ tự động trở thành Admin của trung tâm.</p>
                </form>
              </TabsContent>
            </Tabs>
            <div className="mt-4 text-center text-sm">
              <Link to="/" className="text-muted-foreground hover:text-primary">← Về trang chủ</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
