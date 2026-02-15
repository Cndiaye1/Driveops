// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./services/supabaseClient";
import { useDriveStore } from "./store/useDriveStore";

import Setup from "./components/Setup";
import Cockpit from "./components/Cockpit";
import PinLogin from "./pages/PinLogin";
import Admin from "./pages/Admin";

export default function App() {
  const screen = useDriveStore((s) => s.screen);

  const goSetup = useDriveStore((s) => s.goSetup);
  const goAdmin = useDriveStore((s) => s.goAdmin);
  const goCockpit = useDriveStore((s) => s.goCockpit);

  const siteCode = useDriveStore((s) => s.siteCode);

  const memberRole = useDriveStore((s) => s.memberRole);
  const setMemberRole = useDriveStore((s) => s.setMemberRole);

  const resetAuthState = useDriveStore((s) => s.resetAuthState);

  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  // ✅ loading rôle (évite redirection admin trop tôt)
  const [roleLoading, setRoleLoading] = useState(true);

  const normalizedSite = useMemo(() => (siteCode || "").trim().toLowerCase(), [siteCode]);

  async function refreshMemberRole(sess, site) {
    if (!sess?.user?.id || !site) {
      setMemberRole?.(null);
      return;
    }

    const { data, error } = await supabase
      .from("drive_site_members")
      .select("role")
      .eq("site_code", site) // ✅ lowercase
      .eq("user_id", sess.user.id)
      .maybeSingle();

    if (error) {
      console.error("[refreshMemberRole]", error);
      setMemberRole?.(null);
      return;
    }

    setMemberRole?.(data?.role || null);
  }

  // Boot session + listener
  useEffect(() => {
    let sub;

    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
      setBooting(false);

      sub = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession || null);

        if (!newSession) {
          resetAuthState?.();
        }
      }).data.subscription;
    })();

    return () => sub?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh role sur session/site
  useEffect(() => {
    if (booting) return;

    let cancelled = false;

    (async () => {
      setRoleLoading(true);
      try {
        await refreshMemberRole(session, normalizedSite);
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, session?.user?.id, normalizedSite]);

  // Si connecté mais écran pin => setup
  useEffect(() => {
    if (booting) return;
    if (session && screen === "pin") goSetup?.();
  }, [booting, session, screen, goSetup]);

  // Si connecté mais pas de site => setup
  useEffect(() => {
    if (booting) return;
    if (session && !normalizedSite && screen !== "setup") goSetup?.();
  }, [booting, session, normalizedSite, screen, goSetup]);

  // Garde-fou admin (uniquement quand roleLoading est fini)
  useEffect(() => {
    if (booting) return;
    if (screen === "admin" && !roleLoading && memberRole !== "admin") goSetup?.();
  }, [booting, screen, memberRole, roleLoading, goSetup]);

  if (booting) return <div style={{ padding: 16 }}>Chargement…</div>;

  if (!session) return <PinLogin />;

  const adminState = {
    loading: roleLoading,
    isAdmin: memberRole === "admin",
    role: memberRole,
  };

  if (screen === "admin") return <Admin />;
  if (screen === "cockpit") return <Cockpit />;

  // default
  return <Setup adminState={adminState} />;
}
