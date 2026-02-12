// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./services/supabaseClient";
import { getPairedSiteCode } from "./services/deviceApi";
import PairDevice from "./pages/PairDevice";
import PinLogin from "./pages/PinLogin";

// ✅ adapte selon ton projet :
import Setup from "./pages/Setup";        // si Setup est dans src/pages/Setup.jsx
// import Setup from "./components/Setup"; // si Setup est dans src/components/Setup.jsx
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

  // --- Tick cockpit (1s)
  useEffect(() => {
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [tick]);

  // --- Boot: pairing + session auth
  useEffect(() => {
    (async () => {
      try {
        const paired = await getPairedSiteCode();
        if (!paired) return setPhase("need_pairing");

        // inject siteCode store si différent
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

  // --- Auth listener (logout/login)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
      setPhase(s ? "ready" : "need_login");
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // --- Charger la session “site+date” une fois connecté & prêt
  const canHydrate = useMemo(() => phase === "ready" && !!session && !!siteCode && !!dayDate, [phase, session, siteCode, dayDate]);

  useEffect(() => {
    if (!canHydrate) return;
    ensureSessionLoaded?.();
  }, [canHydrate, ensureSessionLoaded]);

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

  // ✅ App normal
  return screen === "cockpit" ? <Cockpit /> : <Setup />;
}
