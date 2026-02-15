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
  const isAdmin = useMemo(
    () => String(memberRole || "").trim().toLowerCase() === "admin",
    [memberRole]
  );

  const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

  const [sessionInfo, setSessionInfo] = useState({ email: "", id: "" });

  const [form, setForm] = useState({ code: "", pin: "", role: "user", fullName: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [q, setQ] = useState("");

  // loading actions par membre
  const [actionLoading, setActionLoading] = useState({}); // { [user_id]: "role"|"pin"|"delete"|true }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      resetAuthState?.();
      goSetup?.();
    }
  }

  function setRowLoading(userId, v) {
    setActionLoading((s) => ({ ...s, [userId]: v }));
  }

  async function callApi(path, { method = "GET", body } = {}) {
    const token = await getAccessToken();
    if (!token) throw new Error("Session invalide (token manquant). Reconnecte-toi.");

    const url = `${API_BASE}${path}`;

    const r = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Site-Code": normalizedSite || "",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await r.text();
    let j = {};
    try {
      j = text ? JSON.parse(text) : {};
    } catch {
      j = {};
    }

    if (!r.ok) {
      const message = j?.error || `Erreur API (${r.status})`;
      throw new Error(message);
    }
    return j;
  }

  async function loadMembers() {
    if (!normalizedSite) {
      setMembers([]);
      return;
    }

    setMembersLoading(true);
    setMsg(null);

    try {
      const j = await callApi(
        `/api/admin/list-members?siteCode=${encodeURIComponent(normalizedSite)}`
      );
      setMembers(j?.members || []);
    } catch (e) {
      setMembers([]);
      setMsg({ type: "error", text: e?.message || "Erreur list-members" });
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSessionInfo({
        email: data?.session?.user?.email || "",
        id: data?.session?.user?.id || "",
      });
    })();
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

  const adminCount = useMemo(
    () => (members || []).filter((m) => String(m.role || "").toLowerCase() === "admin").length,
    [members]
  );

  function isLastAdmin(targetUserId) {
    const me = members?.find((x) => x.user_id === targetUserId);
    const role = String(me?.role || "").toLowerCase();
    return role === "admin" && adminCount <= 1;
  }

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
    if (!["admin", "manager", "user"].includes(role))
      return setMsg({ type: "error", text: "Rôle invalide." });

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

  async function updateRole(userId, nextRole) {
    if (!isAdmin) return;
    const role = String(nextRole || "").toLowerCase();
    if (!["admin", "manager", "user"].includes(role)) return;

    if (isLastAdmin(userId) && role !== "admin") {
      return setMsg({ type: "error", text: "Impossible : c’est le dernier admin du site." });
    }

    setRowLoading(userId, "role");
    setMsg(null);
    try {
      await callApi(`/api/admin/member-role`, {
        method: "POST",
        body: { siteCode: normalizedSite, userId, role },
      });
      setMsg({ type: "success", text: "Rôle mis à jour." });
      await loadMembers();
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Erreur role" });
    } finally {
      setRowLoading(userId, false);
    }
  }

  async function resetPin(userId, memberCode) {
    if (!isAdmin) return;

    const pin = window.prompt(`Nouveau PIN pour ${memberCode || shortUuid(userId)} :`);
    if (!pin) return;

    setRowLoading(userId, "pin");
    setMsg(null);
    try {
      await callApi(`/api/admin/reset-pin`, {
        method: "POST",
        body: { siteCode: normalizedSite, userId, pin: String(pin).trim() },
      });
      setMsg({ type: "success", text: "PIN réinitialisé." });
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Erreur reset-pin" });
    } finally {
      setRowLoading(userId, false);
    }
  }

  async function removeMember(userId, memberCode) {
    if (!isAdmin) return;

    if (userId === sessionInfo.id) {
      return setMsg({ type: "error", text: "Tu ne peux pas te supprimer toi-même." });
    }

    if (isLastAdmin(userId)) {
      return setMsg({ type: "error", text: "Impossible : c’est le dernier admin du site." });
    }

    const ok = window.confirm(
      `Supprimer le membre "${memberCode || shortUuid(userId)}" du site ${normalizedSite} ?`
    );
    if (!ok) return;

    setRowLoading(userId, "delete");
    setMsg(null);
    try {
      await callApi(`/api/admin/remove-member`, {
        method: "POST",
        body: { siteCode: normalizedSite, userId },
      });
      setMsg({ type: "success", text: "Membre supprimé du site." });
      await loadMembers();
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Erreur remove-member" });
    } finally {
      setRowLoading(userId, false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={goSetup}>
            ← Setup
          </button>
          <button type="button" onClick={goCockpit}>
            Cockpit
          </button>
          <button type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #444", borderRadius: 8 }}>
          <b>Accès limité.</b> Tu dois être <b>admin</b> du site pour créer/assigner/modifier des membres.
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
      </form>

      {msg && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #444" }}>
          <b>{msg.type === "error" ? "Erreur" : "OK"}</b> — {msg.text}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 14, border: "1px solid #333", borderRadius: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ margin: 0 }}>Membres du site</h3>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche (code / rôle / nom)…"
              style={{ minWidth: 260 }}
            />
            <button type="button" onClick={loadMembers} disabled={membersLoading}>
              {membersLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div style={{ opacity: 0.75, fontSize: 12, marginTop: 8 }}>
          Admins: <b>{adminCount}</b>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {(filtered || []).map((m) => {
            const uid = m.user_id;
            const rowBusy = !!actionLoading[uid];
            const role = String(m.role || "").toLowerCase();

            return (
              <div
                key={`${m.site_code}:${uid}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 220px 260px",
                  gap: 10,
                  alignItems: "center",
                  border: "1px solid #444",
                  borderRadius: 10,
                  padding: 10,
                  opacity: rowBusy ? 0.7 : 1,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {m.member_code ? m.member_code : shortUuid(uid)}{" "}
                    {m.full_name ? <span style={{ opacity: 0.8 }}>· {m.full_name}</span> : null}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {m.created_at ? new Date(m.created_at).toLocaleString() : "—"} ·{" "}
                    <span style={{ opacity: 0.9 }}>{shortUuid(uid)}</span>
                  </div>
                </div>

                <div>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Rôle</span>
                    <select
                      value={role}
                      disabled={!isAdmin || rowBusy}
                      onChange={(e) => updateRole(uid, e.target.value)}
                      title={!isAdmin ? "Accès admin requis" : ""}
                    >
                      <option value="user">user</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  {isLastAdmin(uid) && (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      ⚠️ Dernier admin
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={!isAdmin || rowBusy}
                    onClick={() => resetPin(uid, m.member_code)}
                  >
                    {actionLoading[uid] === "pin" ? "..." : "Reset PIN"}
                  </button>

                  <button
                    type="button"
                    disabled={!isAdmin || rowBusy || uid === sessionInfo.id || isLastAdmin(uid)}
                    onClick={() => removeMember(uid, m.member_code)}
                    style={{ borderColor: "#7a2a2a" }}
                    title={uid === sessionInfo.id ? "Impossible de te supprimer toi-même" : ""}
                  >
                    {actionLoading[uid] === "delete" ? "..." : "Supprimer"}
                  </button>
                </div>
              </div>
            );
          })}

          {!membersLoading && (!filtered || filtered.length === 0) && (
            <div style={{ opacity: 0.8 }}>Aucun membre trouvé.</div>
          )}
        </div>
      </div>
    </div>
  );
}
