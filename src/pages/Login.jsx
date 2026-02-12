import React, { useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onLogin(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  async function onSignup() {
    setErr("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // selon réglages Supabase, email de confirmation possible
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 520, margin: "40px auto" }}>
        <h1>🔐 Connexion DriveOps</h1>

        <form onSubmit={onLogin} className="section">
          <label className="muted small">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" />

          <label className="muted small" style={{ marginTop: 10 }}>Mot de passe</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {err ? <div className="card callout warn" style={{ marginTop: 12 }}>{err}</div> : null}

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={busy || !email || !password} type="submit">
              Se connecter
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn ghost" disabled={busy || !email || !password} type="button" onClick={onSignup}>
              Créer un compte
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
