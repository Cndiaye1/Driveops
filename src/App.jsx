// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./services/supabaseClient";
import PinLogin from "./pages/PinLogin";

import Setup from "./components/Setup.jsx";
import Cockpit from "./components/Cockpit";
import { useDriveStore } from "./store/useDriveStore";

export default function App() {
  const screen = useDriveStore((s) => s.screen);
  const tick = useDriveStore((s) => s.tick);

  const ensureSessionLoaded = useDriveStore((s) => s.ensureSessionLoaded);
  const siteCode = useDriveStore((s) => s.siteCode);
  const dayDate = useDriveStore((s) => s.dayDate);

  const [phase, setPhase] = useState("boot"); // boot | need_login | ready
  const [session, setSession] = useState(null);

  // Tick cockpit (1s)
  useEffect(() => {
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [tick]);

  // Boot: session auth
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const s = data?.session || null;
      setSession(s);
      setPhase(s ? "ready" : "need_login");
    })();
  }, []);

  // Auth listener
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
      setPhase(s ? "ready" : "need_login");
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Hydrate session site+date quand prêt
  const canHydrate = useMemo(
    () => phase === "ready" && !!session && !!siteCode && !!dayDate,
    [phase, session, siteCode, dayDate]
  );

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

  if (phase === "need_login") {
    return <PinLogin onLogged={() => setPhase("ready")} />;
  }

  return screen === "cockpit" ? <Cockpit /> : <Setup />;
}

