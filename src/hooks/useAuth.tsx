import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function useRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRoles([]); setLoading(false); return; }
    let active = true;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      if (!active) return;
      setRoles((data ?? []).map((r) => r.role));
      setLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  return {
    roles,
    isAdmin: roles.includes("admin"),
    isCoach: roles.includes("coach"),
    loading,
  };
}
