// src/pages/PinLogin.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { getPairedSiteCode } from "../services/deviceApi";

export default function PinLogin({ onLogged, onNeedPairing }) {
  const [siteCode, setSiteCode] = useState(null);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const sc = await getPairedSiteCode();
        if (!sc) return onNeedPairing?.();
        setSiteCode(sc);
      } catch (e) {
        setErr(String(e?.message || e));
      }
    })();
  }, [onNeedPairing]);

  const login = async () => {
    setErr(null);
    setLoading(true);
    try {
      const sc = String(siteCode || "").trim().toUpperCase();
      const c = String(code || "").trim().toUpperCase();
      const p = String(pin || "").trim();

      if (!sc) throw new Error("Appareil non lié à un site.");
      if (!c) throw new Error("Code requis.");
      if (!p) throw new Error("PIN requis.");

      // email “virtuel” : SITE__CODE@driveops.local
      const email = `${sc}__${c}@driveops.local`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: p,
      });

      // ✅ amélioration #1: erreur “vraie”
      if (error) {
        throw new Error(error.message || "Connexion impossible.");
      }

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
        <div className="muted">
          Site: <b>{siteCode || "—"}</b>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CODE (ex: BAMBA)"
            style={{ minWidth: 220 }}
            autoComplete="username"
          />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            type="password"
            inputMode="numeric"
            style={{ minWidth: 180 }}
            autoComplete="current-password"
          />
          <button className="btn primary" disabled={loading} onClick={login}>
            {loading ? "..." : "➡️ Entrer"}
          </button>

          {/* ✅ amélioration #2: re-pair */}
          <button className="btn ghost" disabled={loading} onClick={onNeedPairing}>
            🔧 Re-pair
          </button>
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
