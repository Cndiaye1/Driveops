// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./services/supabaseClient";
import { getPairedSiteCode } from "./services/deviceApi";
import PairDevice from "./pages/PairDevice";
import PinLogin from "./pages/PinLogin";
import Setup from "./pages/Setup";
import Cockpit from "./components/Cockpit";
import { useDriveStore } from "./store/useDriveStore";

export default function App() {
  const screen = useDriveStore((s) => s.screen);
  const tick = useDriveStore((s) => s.tick);

  const ensureSessionLoaded = useDriveStore((s) => s.ensureSessionLoaded);
  const siteCode = useDriveStore((s) => s.siteCode);
  const setSiteCode = useDriveStore((s) => s.setSiteCode);
  const dayDate = useDriveStore((s) => s.dayDate);

  const [phase, setPhase] = useState("boot"); // boot | need_pairing | need_login | ready
  const [session, setSession] = useState(null);

  useEffect(() => {
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    (async () => {
      try {
        const paired = await getPairedSiteCode();
        if (!paired) return setPhase("need_pairing");

        if (paired && String(siteCode || "").toUpperCase() !== paired) {
          setSiteCode(paired);
        }

        const { data } = await supabase.auth.getSession();
        const s = data?.session || null;
        setSession(s);

        if (!s) return setPhase("need_login");
        setPhase("ready");
      } catch {
        setPhase("need_pairing");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
      setPhase(s ? "ready" : "need_login");
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const canHydrate = useMemo(
    () => phase === "ready" && !!session && !!siteCode && !!dayDate,
    [phase, session, siteCode, dayDate]
  );

  useEffect(() => {
    if (!canHydrate) return;
    ensureSessionLoaded?.();
  }, [canHydrate, ensureSessionLoaded]);

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPhase("need_login");
  };

  if (phase === "boot") {
    return (
      <div className="page">
        <div className="card">
          <h1>DriveOps</h1>
          <p className="muted">Chargement…</p>
        </div>
      </div>
    );
  }

  if (phase === "need_pairing") {
    return (
      <PairDevice
        defaultSite="MELUN"
        onPaired={(sc) => {
          setSiteCode(sc);
          setPhase("need_login");
        }}
      />
    );
  }

  if (phase === "need_login") {
    return (
      <PinLogin
        onNeedPairing={() => setPhase("need_pairing")}
        onLogged={() => setPhase("ready")}
      />
    );
  }

  // ✅ App normal + header logout
  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="muted">
          Connecté : <b>{session?.user?.email || "—"}</b> — Site : <b>{siteCode}</b>
        </div>
        <button className="btn ghost" onClick={logout} title="Se déconnecter">
          🚪 Déconnexion
        </button>
      </div>

      {screen === "cockpit" ? <Cockpit /> : <Setup />}
    </div>
  );
}
