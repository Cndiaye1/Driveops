// src/pages/PinLogin.jsx
import React, { useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

export default function PinLogin({ onLogged }) {
  const setSiteCode = useDriveStore((s) => s.setSiteCode);

  const [site, setSite] = useState(import.meta.env.VITE_SITE_CODE || "MELUN");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const norm = (s) => String(s || "").trim().toUpperCase();

  const login = async () => {
    setErr(null);
    setLoading(true);

    try {
      const sc = norm(site);
      const c = norm(code);
      const p = String(pin || "").trim();

      if (!sc) throw new Error("Site requis.");
      if (!c) throw new Error("Code requis.");
      if (!p) throw new Error("PIN requis.");

      const email = `${sc}__${c}@driveops.local`;

      // 1) tentative sign-in
      let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: p,
      });

      // 2) si échec => on crée le compte (méthode B)
      if (error) {
        const msg = String(error.message || "");
        const looksLikeBadCreds =
          msg.toLowerCase().includes("invalid login credentials") ||
          msg.toLowerCase().includes("invalid") ||
          msg.toLowerCase().includes("credentials");

        if (!looksLikeBadCreds) throw new Error(msg);

        // signUp (nécessite: Email confirmations OFF dans Supabase Auth)
        const res = await supabase.auth.signUp({
          email,
          password: p,
          options: {
            data: { site_code: sc, staff_code: c }, // (optionnel)
          },
        });

        if (res.error) {
          // souvent: "Email confirmation required"
          throw new Error(
            `Création du compte impossible: ${res.error.message}. ` +
              `➡️ Dans Supabase Auth, désactive "Email confirmations".`
          );
        }

        data = res.data;

        // si pas de session (confirm email activée)
        if (!data?.session) {
          throw new Error(
            `Compte créé, mais pas de session. ` +
              `➡️ Désactive "Email confirmations" dans Supabase Auth.`
          );
        }
      }

      // stocke le site dans le store
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

        <div className="muted" style={{ marginTop: 6 }}>
          Astuce admin : CODE <b>ADMIN</b>
        </div>

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
            placeholder="CODE (ex: SARAH / ADMIN)"
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

        {err ? (
          <div className="card callout warn" style={{ marginTop: 12 }}>
            {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}
