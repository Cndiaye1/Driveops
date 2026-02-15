// src/pages/PinLogin.jsx
import React, { useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

function normLower(s) {
  return String(s || "").trim().toLowerCase();
}

export default function PinLogin({ onLogged } = {}) {
  const setSiteCode = useDriveStore((s) => s.setSiteCode);
  const goSetup = useDriveStore((s) => s.goSetup);

  const [site, setSite] = useState(import.meta.env.VITE_SITE_CODE || "melun");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const email = useMemo(() => {
    const sc = normLower(site);
    const c = normLower(code);
    if (!sc || !c) return "";
    return `${sc}__${c}@driveops.local`;
  }, [site, code]);

  const login = async () => {
    setErr(null);
    setLoading(true);

    try {
      const sc = normLower(site);
      const c = normLower(code);
      const p = String(pin || "").trim();

      if (!sc) throw new Error("Site requis.");
      if (!c) throw new Error("Code requis.");
      if (!p) throw new Error("PIN requis.");

      // ✅ LOGIN uniquement (pas de signUp)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: `${sc}__${c}@driveops.local`,
        password: p,
      });

      if (error) {
        const msg = String(error.message || "");
        const low = msg.toLowerCase();

        if (low.includes("invalid login credentials")) {
          throw new Error("Code ou PIN incorrect.");
        }
        if (low.includes("email not confirmed")) {
          throw new Error(
            "Compte non confirmé. (Si tu crées des users via Admin API, force email_confirm: true côté serveur.)"
          );
        }
        throw new Error(msg || "Connexion impossible.");
      }

      // ✅ stocke le site en base (ton store travaille en lowercase)
      await setSiteCode(sc);

      // optionnel : si App.jsx ne route pas immédiatement
      goSetup?.();
      try {
        useDriveStore.setState({ screen: "setup" });
      } catch {}

      onLogged?.(data?.session);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <h1>🔐 Connexion</h1>

        <div className="muted" style={{ marginTop: 6 }}>
          Connecte-toi avec ton <b>CODE</b> et ton <b>PIN</b> créés par l’admin.
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="SITE (ex: melun)"
            style={{ minWidth: 200 }}
          />

          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CODE (ex: bamba / p01)"
            style={{ minWidth: 220 }}
          />

          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            type="password"
            inputMode="numeric"
            style={{ minWidth: 180 }}
            onKeyDown={(e) => e.key === "Enter" && login()}
          />

          <button className="btn primary" disabled={loading} onClick={login}>
            {loading ? "..." : "➡️ Entrer"}
          </button>
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Email technique : <b>{email || "—"}</b>
        </div>

        {err ? (
          <div className="card callout warn" style={{ marginTop: 12 }}>
            {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}
