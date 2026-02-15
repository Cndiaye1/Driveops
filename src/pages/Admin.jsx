// src/pages/Admin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

function shortUuid(u) {
  if (!u) return "";
  return `${u.slice(0, 8)}…${u.slice(-6)}`;
}

export default function Admin() {
  const siteCode = useDriveStore((s) => s.siteCode);
  const memberRole = useDriveStore((s) => s.memberRole);

  const goSetup = useDriveStore((s) => s.goSetup);
  const goCockpit = useDriveStore((s) => s.goCockpit);
  const resetAuthState = useDriveStore((s) => s.resetAuthState);

  const normalizedSite = useMemo(() => (siteCode || "").trim().toLowerCase(), [siteCode]);
  const isAdmin = useMemo(() => String(memberRole || "").trim().toLowerCase() === "admin", [memberRole]);

  // prod: "" => same-origin
  const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

  const [sessionInfo, setSessionInfo] = useState({ email: "", id: "" });

  const [form, setForm] = useState({ code: "", pin: "", role: "user", fullName: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [q, setQ] = useState("");

  function pushUrl(pathname) {
    try {
      if (typeof window !== "undefined" && window.location.pathname !== pathname) {
        window.history.pushState({}, "", pathname);
      }
    } catch {}
  }

  function setScreenSafe(screen) {
    try {
      // Zustand store instance has setState
      useDriveStore.setState({ screen });
    } catch {}
  }

  function goToSetup() {
    goSetup?.();
    setScreenSafe("setup");
    // ✅ important si tu es sur /admin sur Vercel
    pushUrl("/");
  }

  function goToCockpit() {
    goCockpit?.();
    setScreenSafe("cockpit");
    // cockpit est affiché par App.jsx (screen === "cockpit") sur la racine
    pushUrl("/");
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      resetAuthState?.();
      setScreenSafe("setup");
      // ✅ hard fallback
      try {
        window.location.assign("/");
      } catch {}
    }
  }

  async function callApi(path, { method = "GET", body } = {}) {
    const token = await getAccessToken();
    if (!token) throw new Error("Session invalide (token manquant). Reconnecte-toi.");

    const url = `${API_BASE}${path}`;

    try {
      const r = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          // utile si tu veux l’utiliser côté API + debug
          "X-Site-Code": normalizedSite || "",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await r.text();
      let j = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {}

      if (!r.ok) {
        const message = j?.error || `Erreur API (${r.status})`;
        const err = new Error(message);
        err.status = r.status;
        throw err;
      }

      return j;
    } catch (e) {
      const m = String(e?.message || e);
      if (m.toLowerCase().includes("failed to fetch")) {
        throw new Error("Failed to fetch (API inaccessible / proxy local / CORS / vercel dev non lancé).");
      }
      throw e;
    }
  }

  async function loadMembers() {
    if (!normalizedSite) {
      setMembers([]);
      return;
    }

    setMembersLoading(true);
    setMsg(null);

    try {
      const j = await callApi(`/api/admin/list-members?siteCode=${encodeURIComponent(normalizedSite)}`);
      setMembers(j?.members || []);
    } catch (e) {
      setMembers([]);
      setMsg({ type: "error", text: e?.message || "Erreur list-members" });
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    // ✅ si tu utilises /admin sur Vercel, on garde l’URL cohérente
    pushUrl("/admin");

    (async () => {
      const { data } = await supabase.auth.getSession();
      setSessionInfo({
        email: data?.session?.user?.email || "",
        id: data?.session?.user?.id || "",
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSite]);

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return members;

    return (members || []).filter((m) => {
      const code = (m.member_code || "").toLowerCase();
      const role = (m.role || "").toLowerCase();
      const name = (m.full_name || "").toLowerCase();
      return code.includes(s) || role.includes(s) || name.includes(s);
    });
  }, [members, q]);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!normalizedSite) return setMsg({ type: "error", text: "Site manquant. Reviens au Setup." });
    if (!isAdmin) return setMsg({ type: "error", text: "Accès refusé : tu n’es pas admin." });

    const code = form.code.trim().toLowerCase();
    const pin = form.pin.trim();
    const role = form.role.trim().toLowerCase();
    const fullName = form.fullName.trim();

    if (!code || !pin) return setMsg({ type: "error", text: "CODE et PIN obligatoires." });
    if (!["admin", "manager", "user"].includes(role)) return setMsg({ type: "error", text: "Rôle invalide." });

    setLoading(true);
    try {
      const j = await callApi(`/api/admin/create-user`, {
        method: "POST",
        body: { siteCode: normalizedSite, code, pin, role, fullName },
      });

      setMsg({
        type: "success",
        text: `${j.created ? "Créé" : "Mis à jour"} : ${j.member_code} (${j.role})`,
      });

      setForm({ code: "", pin: "", role: "user", fullName: "" });
      await loadMembers();
    } catch (err) {
      setMsg({ type: "error", text: err?.message || "Erreur create-user" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Admin</h2>

          <div style={{ opacity: 0.8, marginTop: 4 }}>
            Site: <b>{normalizedSite || "—"}</b> · Ton rôle: <b>{memberRole || "—"}</b>
          </div>

          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
            Session: <b>{sessionInfo.email || "—"}</b> · <span>{shortUuid(sessionInfo.id)}</span>
          </div>

          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>
            API base: <b>{API_BASE || "(same origin)"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={goToSetup}>
            ← Setup
          </button>
          <button type="button" onClick={goToCockpit}>
            Cockpit
          </button>
          <button type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #444", borderRadius: 8 }}>
          <b>Accès limité.</b> Tu dois être <b>admin</b> du site pour créer/assigner des membres.
        </div>
      )}

      <form
        onSubmit={onSubmit}
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #333",
          borderRadius: 10,
          opacity: isAdmin ? 1 : 0.6,
          pointerEvents: isAdmin ? "auto" : "none",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Créer / mettre à jour un membre (CODE + PIN)</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            CODE
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="ex: p01 / bamba / cheikh"
              style={{ width: "100%" }}
            />
          </label>

          <label>
            PIN
            <input
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              placeholder="ex: 1234"
              style={{ width: "100%" }}
            />
          </label>

          <label>
            Rôle
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={{ width: "100%" }}
            >
              <option value="user">user</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
          </label>

          <label>
            Nom (optionnel)
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="ex: Bamba"
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <button disabled={loading} style={{ marginTop: 12, width: "100%" }}>
          {loading ? "..." : "Créer / Mettre à jour"}
        </button>

        {msg && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #444" }}>
            <b>{msg.type === "error" ? "Erreur" : "OK"}</b> — {msg.text}
          </div>
        )}
      </form>

      <div style={{ marginTop: 16, padding: 14, border: "1px solid #333", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Membres du site</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche (code / rôle / nom)…"
              style={{ minWidth: 240 }}
            />
            <button type="button" onClick={loadMembers} disabled={membersLoading}>
              {membersLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {(filtered || []).map((m) => (
            <div
              key={`${m.site_code}:${m.user_id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                border: "1px solid #444",
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>
                  {m.member_code ? m.member_code : shortUuid(m.user_id)}{" "}
                  {m.full_name ? <span style={{ opacity: 0.8 }}>· {m.full_name}</span> : null}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                </div>
              </div>

              <div style={{ fontWeight: 800 }}>{m.role}</div>
            </div>
          ))}

          {!membersLoading && (!filtered || filtered.length === 0) && (
            <div style={{ opacity: 0.8 }}>Aucun membre trouvé.</div>
          )}
        </div>
      </div>
    </div>
  );
}
