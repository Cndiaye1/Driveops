import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  async function loadProfile(userId) {
    if (!userId) return setProfile(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.warn("profiles load error", error);
      setProfile(null);
      return;
    }
    setProfile(data || null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session || null;
      setSession(s);
      loadProfile(s?.user?.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s || null);
      loadProfile(s?.user?.id);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const role = profile?.role || "user";
  return {
    session,
    user: session?.user || null,
    profile,
    role,
    isAdmin: role === "admin",
  };
}
