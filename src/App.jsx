// src/App.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "./services/supabaseClient";
import { useDriveStore } from "./store/useDriveStore";

import Setup from "./components/Setup";
import Cockpit from "./components/Cockpit";
import PinLogin from "./pages/PinLogin";
import Admin from "./pages/Admin";

// ------------------------
// Hash routing (stable sur Vercel sans rewrite)
//   #/          -> setup
//   #/cockpit   -> cockpit
//   #/admin     -> admin
function hashToScreen(hash) {
  const h = String(hash || "").trim();
  if (h.startsWith("#/admin")) return "admin";
  if (h.startsWith("#/cockpit")) return "cockpit";
  return "setup";
}

function screenToHash(screen) {
  if (screen === "admin") return "#/admin";
  if (screen === "cockpit") return "#/cockpit";
  return "#/";
}

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

  const refreshMemberRole = useCallback(
    async (sess, site) => {
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
    },
    [setMemberRole]
  );

  // ------------------------
  // 1) Boot session + listener auth
  useEffect(() => {
    let sub;

    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
      setBooting(false);

      sub = supabase.auth
        .onAuthStateChange((_event, newSession) => {
          setSession(newSession || null);

          if (!newSession) {
            resetAuthState?.();
          }
        })
        .data.subscription;
    })();

    return () => sub?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------
  // 2) Sync URL(hash) -> screen au chargement + back/forward
  useEffect(() => {
    if (booting) return;

    const syncFromHash = () => {
      const wanted = hashToScreen(window.location.hash);
      if (wanted === "admin") goAdmin?.();
      else if (wanted === "cockpit") goCockpit?.();
      else goSetup?.();
    };

    // first sync
    syncFromHash();

    // listen changes (navigation + back/forward)
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [booting, goAdmin, goCockpit, goSetup]);

  // ------------------------
  // 3) Sync screen -> URL(hash) (quand tu cliques sur les boutons)
  useEffect(() => {
    if (booting) return;
    const targetHash = screenToHash(screen);
    if (window.location.hash !== targetHash) {
      // replaceState = évite de polluer l’historique si tu veux
      // mais hash = OK aussi. Je mets assign via hash (simple + stable).
      window.location.hash = targetHash;
    }
  }, [booting, screen]);

  // ------------------------
  // 4) Refresh role sur session/site
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
  }, [booting, session?.user?.id, normalizedSite, refreshMemberRole]);

  // ------------------------
  // 5) Garde-fous
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

  // ------------------------
  // Render
  if (booting) return <div style={{ padding: 16 }}>Chargement…</div>;

  if (!session) return <PinLogin />;

  const adminState = {
    loading: roleLoading,
    isAdmin: memberRole === "admin",
    role: memberRole,
  };

  if (screen === "admin") return <Admin />;
  if (screen === "cockpit") return <Cockpit />;

  return <Setup adminState={adminState} />;
}
