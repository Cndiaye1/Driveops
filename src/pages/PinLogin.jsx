// src/pages/PinLogin.jsx
import React, { useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

export default function PinLogin({ onLogged }) {
  const setSiteCode = useDriveStore((s) => s.setSiteCode);

  const [site, setSite] = useState("MELUN");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const login = async () => {
    setErr(null);
    setLoading(true);
    try {
      const sc = String(site || "").trim().toUpperCase();
      const c = String(code || "").trim().toUpperCase();
      const p = String(pin || "").trim();

      if (!sc) throw new Error("Site requis.");
      if (!c) throw new Error("Code requis.");
      if (!p) throw new Error("PIN requis.");

      const email = `${sc}__${c}@driveops.local`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: p,
      });

      if (error) throw new Error("Identifiants incorrects.");

      // ✅ stocke le site dans le store
      await setSiteCode(sc);

      onLogged?.(data.session);
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

        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="SITE (ex: MELUN)"
            style={{ minWidth: 200 }}
          />

          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CODE (ex: BAMBA)"
            style={{ minWidth: 220 }}
          />

          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            type="password"
            inputMode="numeric"
            style={{ minWidth: 180 }}
          />

          <button className="btn primary" disabled={loading} onClick={login}>
            {loading ? "..." : "➡️ Entrer"}
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
