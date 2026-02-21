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
  const setSiteCode = useDriveStore((s) => s.setSiteCode);

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

  // ---- Global admin / multi-sites (optionnel, si endpoint dispo)
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  // site cible pour l’admin (ne change pas automatiquement le site “opérationnel” du store)
  const [adminSite, setAdminSite] = useState("");

  // ---- Create site (optionnel)
  const [siteForm, setSiteForm] = useState({ code: "", name: "" });
  const [siteCreating, setSiteCreating] = useState(false);

  // ---- Members
  const [form, setForm] = useState({ code: "", pin: "", role: "user", fullName: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [q, setQ] = useState("");

  const [actionLoading, setActionLoading] = useState({}); // { [user_id]: "role"|"pin"|"delete"|false }

  const canManage = useMemo(() => isAdmin || isGlobalAdmin, [isAdmin, isGlobalAdmin]);

  // adminSite init/sync
  useEffect(() => {
    setAdminSite((prev) => prev || normalizedSite || "");
  }, [normalizedSite]);

  // si pas global, on force adminSite = site du store
  useEffect(() => {
    if (!isGlobalAdmin) setAdminSite(normalizedSite || "");
  }, [isGlobalAdmin, normalizedSite]);

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

  async function callApi(
    path,
    {
      method = "GET",
      body,
      site = adminSite,
      includeSiteHeader = true,
    } = {}
  ) {
    const token = await getAccessToken();
    if (!token) throw new Error("Session invalide (token manquant). Reconnecte-toi.");

    const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (includeSiteHeader) {
      headers["X-Site-Code"] = (site || "").trim().toLowerCase();
    }

    const r = await fetch(url, {
      method,
      headers,
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

  // ------------------------
  // Sites (optionnel)
  async function loadSites() {
    setSitesLoading(true);
    try {
      const j = await callApi("/api/admin/list-sites", { includeSiteHeader: false });

      const list = j?.sites || j?.data || [];
      if (Array.isArray(list)) {
        setSites(list);
        setIsGlobalAdmin(true);
      } else {
        setSites([]);
        setIsGlobalAdmin(false);
      }
    } catch {
      setSites([]);
      setIsGlobalAdmin(false);
    } finally {
      setSitesLoading(false);
    }
  }

  async function createSite(e) {
    e?.preventDefault?.();
    if (!isGlobalAdmin) return;

    const code = String(siteForm.code || "").trim().toLowerCase();
    const name = String(siteForm.name || "").trim();
    if (!code) return setMsg({ type: "error", text: "Code site requis (ex: melun)." });

    setSiteCreating(true);
    setMsg(null);
    try {
      await callApi("/api/admin/site-create", {
        method: "POST",
        includeSiteHeader: false,
        body: {
          siteCode: code,
          site_code: code,
          name: name || null,
        },
      });

      setMsg({ type: "success", text: `Site créé / existant : ${code}` });
      setSiteForm({ code: "", name: "" });
      await loadSites();
      setAdminSite(code);
    } catch (e2) {
      setMsg({ type: "error", text: e2?.message || "Erreur site-create" });
    } finally {
      setSiteCreating(false);
    }
  }

  // ------------------------
  // Members
  async function loadMembers() {
    const targetSite = (adminSite || "").trim().toLowerCase();
    if (!targetSite) {
      setMembers([]);
      return;
    }

    setMembersLoading(true);
    setMsg(null);

    try {
      const j = await callApi(
        `/api/admin/list-members?siteCode=${encodeURIComponent(targetSite)}`,
        { site: targetSite }
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
    loadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSite]);

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

    const targetSite = (adminSite || "").trim().toLowerCase();
    if (!targetSite) return setMsg({ type: "error", text: "Site manquant. Reviens au Setup." });
    if (!canManage) return setMsg({ type: "error", text: "Accès refusé : admin requis." });

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
        site: targetSite,
        body: { siteCode: targetSite, code, pin, role, fullName },
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
    if (!canManage) return;
    const role = String(nextRole || "").toLowerCase();
    if (!["admin", "manager", "user"].includes(role)) return;

    if (isLastAdmin(userId) && role !== "admin") {
      return setMsg({ type: "error", text: "Impossible : c’est le dernier admin du site." });
    }

    const targetSite = (adminSite || "").trim().toLowerCase();
    setRowLoading(userId, "role");
    setMsg(null);
    try {
      await callApi(`/api/admin/member-role`, {
        method: "POST",
        site: targetSite,
        body: { siteCode: targetSite, userId, role },
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
    if (!canManage) return;

    const pin = window.prompt(`Nouveau PIN pour ${memberCode || shortUuid(userId)} :`);
    if (!pin) return;

    const targetSite = (adminSite || "").trim().toLowerCase();
    setRowLoading(userId, "pin");
    setMsg(null);
    try {
      await callApi(`/api/admin/reset-pin`, {
        method: "POST",
        site: targetSite,
        body: { siteCode: targetSite, userId, pin: String(pin).trim() },
      });
      setMsg({ type: "success", text: "PIN réinitialisé." });
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Erreur reset-pin" });
    } finally {
      setRowLoading(userId, false);
    }
  }

  async function removeMember(userId, memberCode) {
    if (!canManage) return;

    if (userId === sessionInfo.id) {
      return setMsg({ type: "error", text: "Tu ne peux pas te supprimer toi-même." });
    }

    if (isLastAdmin(userId)) {
      return setMsg({ type: "error", text: "Impossible : c’est le dernier admin du site." });
    }

    const targetSite = (adminSite || "").trim().toLowerCase();
    const ok = window.confirm(
      `Supprimer le membre "${memberCode || shortUuid(userId)}" du site ${targetSite} ?`
    );
    if (!ok) return;

    setRowLoading(userId, "delete");
    setMsg(null);
    try {
      await callApi(`/api/admin/remove-member`, {
        method: "POST",
        site: targetSite,
        body: { siteCode: targetSite, userId },
      });
      setMsg({ type: "success", text: "Membre supprimé du site." });
      await loadMembers();
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Erreur remove-member" });
    } finally {
      setRowLoading(userId, false);
    }
  }

  const targetSiteLabel = (adminSite || "").trim().toLowerCase() || "—";

  // ------------------------
  // UI styles (dark / simple / readable)
  const UI = {
    page: {
      padding: 16,
      maxWidth: 960,
      margin: "0 auto",
      color: "#e8eefc",
    },
    card: {
      background: "rgba(8,14,28,0.72)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14,
      padding: 14,
      boxShadow: "0 6px 28px rgba(0,0,0,0.18)",
    },
    sectionTitle: {
      margin: 0,
      fontSize: 18,
      fontWeight: 800,
    },
    sub: {
      opacity: 0.75,
      fontSize: 12,
      marginTop: 4,
    },
    row: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
    },
    btn: {
      height: 36,
      padding: "0 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.03)",
      color: "#e8eefc",
      cursor: "pointer",
      fontWeight: 600,
    },
    btnPrimary: {
      height: 36,
      padding: "0 12px",
      borderRadius: 10,
      border: "1px solid rgba(77,137,255,0.45)",
      background: "rgba(77,137,255,0.18)",
      color: "#e8eefc",
      cursor: "pointer",
      fontWeight: 700,
    },
    btnDanger: {
      height: 34,
      padding: "0 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,92,92,0.35)",
      background: "rgba(255,92,92,0.10)",
      color: "#ffd0d0",
      cursor: "pointer",
      fontWeight: 700,
    },
    input: {
      width: "100%",
      height: 38,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.03)",
      color: "#e8eefc",
      padding: "0 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    select: {
      width: "100%",
      height: 38,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "#0b1220",
      color: "#e8eefc",
      padding: "0 12px",
      outline: "none",
      boxSizing: "border-box",
      appearance: "auto",
    },
    label: {
      display: "grid",
      gap: 6,
      fontSize: 12,
      color: "rgba(232,238,252,0.9)",
    },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      height: 24,
      padding: "0 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.03)",
      color: "#dfe7fb",
    },
  };

  return (
    <div style={UI.page}>
      {/* force lisibilité des menus déroulants sur Chrome/Windows */}
      <style>{`
        select, option {
          background: #0b1220;
          color: #e8eefc;
        }
        select:disabled, button:disabled, input:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
      `}</style>

      {/* HEADER SIMPLE */}
      <div style={{ ...UI.card, marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Administration</h2>

            <div style={{ ...UI.row, marginTop: 8, gap: 8 }}>
              <span style={UI.badge}>Site app: {normalizedSite || "—"}</span>
              <span style={UI.badge}>Rôle: {memberRole || "—"}</span>
              {isGlobalAdmin ? <span style={UI.badge}>🌍 Global admin</span> : null}
            </div>

            {/* volontairement léger: on masque id / api base */}
            {sessionInfo.email ? (
              <div style={{ ...UI.sub, marginTop: 8 }}>Session: {sessionInfo.email}</div>
            ) : null}
          </div>

          <div style={{ ...UI.row, gap: 8 }}>
            <button type="button" onClick={goSetup} style={UI.btn}>
              ← Setup
            </button>
            <button type="button" onClick={goCockpit} style={UI.btn}>
              Cockpit
            </button>
            <button type="button" onClick={logout} style={UI.btnDanger}>
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* SITE CIBLE */}
      <div style={{ ...UI.card, marginBottom: 14 }}>
        <div style={{ ...UI.sectionTitle, fontSize: 17 }}>📁 Site cible (Admin)</div>
        <div style={UI.sub}>
          Gère les membres du site sélectionné sans changer automatiquement le site opérationnel.
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: isGlobalAdmin && sites.length > 0 ? "1fr auto auto auto" : "1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          {isGlobalAdmin && sites.length > 0 ? (
            <>
              <label style={UI.label}>
                <span>Choisir un site</span>
                <select
                  value={targetSiteLabel}
                  onChange={(e) => setAdminSite(String(e.target.value || "").trim().toLowerCase())}
                  style={UI.select}
                >
                  {sites.map((s) => {
                    const code = String(s.site_code || s.code || "").trim().toLowerCase();
                    const name = String(s.name || "").trim();
                    return (
                      <option key={code} value={code}>
                        {code}
                        {name ? ` — ${name}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              <button type="button" onClick={loadMembers} disabled={membersLoading} style={UI.btn}>
                {membersLoading ? "..." : "Voir membres"}
              </button>

              <button
                type="button"
                onClick={() => setSiteCode?.(targetSiteLabel)}
                disabled={!targetSiteLabel}
                title="Mettre ce site comme site de l’app (Setup/Cockpit)"
                style={UI.btn}
              >
                Utiliser dans l’app
              </button>

              <button type="button" onClick={loadSites} disabled={sitesLoading} style={UI.btn}>
                {sitesLoading ? "..." : "Tester list-sites"}
              </button>
            </>
          ) : (
            <>
              <label style={UI.label}>
                <span>Site ciblé</span>
                <input value={targetSiteLabel} readOnly style={UI.input} />
              </label>

              <button type="button" onClick={loadSites} disabled={sitesLoading} style={UI.btn}>
                {sitesLoading ? "..." : "Tester list-sites"}
              </button>
            </>
          )}
        </div>

        {!isGlobalAdmin ? (
          <div style={{ ...UI.sub, marginTop: 10 }}>
            Mode mono-site (list-sites indisponible ou non autorisé).
          </div>
        ) : null}

        {isGlobalAdmin ? (
          <form onSubmit={createSite} style={{ marginTop: 14 }}>
            <div style={{ ...UI.row, justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 800 }}>➕ Créer un site</div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 140px",
                gap: 10,
                alignItems: "end",
              }}
            >
              <label style={UI.label}>
                <span>Code site</span>
                <input
                  value={siteForm.code}
                  onChange={(e) => setSiteForm((s) => ({ ...s, code: e.target.value }))}
                  placeholder="ex: melun"
                  style={UI.input}
                />
              </label>

              <label style={UI.label}>
                <span>Nom (optionnel)</span>
                <input
                  value={siteForm.name}
                  onChange={(e) => setSiteForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="ex: Melun"
                  style={UI.input}
                />
              </label>

              <button type="submit" disabled={siteCreating} style={UI.btnPrimary}>
                {siteCreating ? "..." : "Créer"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {!canManage && (
        <div style={{ ...UI.card, marginBottom: 14, borderColor: "rgba(255,170,80,0.35)" }}>
          <b>Accès limité.</b> Tu dois être <b>admin</b> (ou global admin) pour créer/modifier les
          membres.
        </div>
      )}

      {/* CREATE / UPDATE MEMBER */}
      <form
        onSubmit={onSubmit}
        style={{
          ...UI.card,
          marginBottom: 14,
          opacity: canManage ? 1 : 0.6,
          pointerEvents: canManage ? "auto" : "none",
        }}
      >
        <div style={{ ...UI.row, justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={UI.sectionTitle}>👤 Créer / mettre à jour un membre</div>
            <div style={UI.sub}>Création ou mise à jour via CODE + PIN sur le site cible.</div>
          </div>

          <span style={UI.badge}>Site cible: {targetSiteLabel}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={UI.label}>
            <span>CODE</span>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="ex: p01 / bamba / cheikh"
              style={UI.input}
            />
          </label>

          <label style={UI.label}>
            <span>PIN</span>
            <input
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              placeholder="ex: 1234"
              style={UI.input}
            />
          </label>

          <label style={UI.label}>
            <span>Rôle</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={UI.select}
            >
              <option value="user">user</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
          </label>

          <label style={UI.label}>
            <span>Nom (optionnel)</span>
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="ex: Bamba"
              style={UI.input}
            />
          </label>
        </div>

        <button disabled={loading} style={{ ...UI.btnPrimary, marginTop: 12, width: "100%" }}>
          {loading ? "..." : "Créer / Mettre à jour"}
        </button>
      </form>

      {/* MESSAGE */}
      {msg && (
        <div
          style={{
            ...UI.card,
            marginBottom: 14,
            borderColor:
              msg.type === "error"
                ? "rgba(255,92,92,0.30)"
                : "rgba(76,175,80,0.28)",
            background:
              msg.type === "error"
                ? "rgba(255,92,92,0.06)"
                : "rgba(76,175,80,0.05)",
          }}
        >
          <b>{msg.type === "error" ? "Erreur" : "OK"}</b> — {msg.text}
        </div>
      )}

      {/* MEMBERS LIST */}
      <div style={UI.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>👥 Membres du site</h3>
            <div style={UI.sub}>
              Site: <b>{targetSiteLabel}</b> · Admins: <b>{adminCount}</b> · Total:{" "}
              <b>{members?.length || 0}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche (code / rôle / nom)…"
              style={{ ...UI.input, minWidth: 260 }}
            />
            <button type="button" onClick={loadMembers} disabled={membersLoading} style={UI.btn}>
              {membersLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {(filtered || []).map((m) => {
            const uid = m.user_id;
            const rowBusy = !!actionLoading[uid];
            const role = String(m.role || "").toLowerCase();
            const isMe = uid === sessionInfo.id;

            return (
              <div
                key={`${m.site_code}:${uid}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: 10,
                  background: "rgba(255,255,255,0.02)",
                  opacity: rowBusy ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 220px auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  {/* Infos légères : plus d’ID affiché */}
                  <div>
                    <div style={{ fontWeight: 800, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span>{m.member_code || "membre"}</span>
                      {m.full_name ? <span style={{ opacity: 0.8 }}>· {m.full_name}</span> : null}
                      {isMe ? <span style={UI.badge}>Toi</span> : null}
                      {role === "admin" ? <span style={UI.badge}>admin</span> : null}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                    </div>
                  </div>

                  <div>
                    <label style={UI.label}>
                      <span>Rôle</span>
                      <select
                        value={role}
                        disabled={!canManage || rowBusy}
                        onChange={(e) => updateRole(uid, e.target.value)}
                        title={!canManage ? "Accès admin requis" : ""}
                        style={UI.select}
                      >
                        <option value="user">user</option>
                        <option value="manager">manager</option>
                        <option value="admin">admin</option>
                      </select>
                    </label>
                    {isLastAdmin(uid) && (
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                        ⚠️ Dernier admin
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={!canManage || rowBusy}
                      onClick={() => resetPin(uid, m.member_code)}
                      style={UI.btn}
                    >
                      {actionLoading[uid] === "pin" ? "..." : "Reset PIN"}
                    </button>

                    <button
                      type="button"
                      disabled={!canManage || rowBusy || isMe || isLastAdmin(uid)}
                      onClick={() => removeMember(uid, m.member_code)}
                      style={UI.btnDanger}
                      title={isMe ? "Impossible de te supprimer toi-même" : ""}
                    >
                      {actionLoading[uid] === "delete" ? "..." : "Supprimer"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!membersLoading && (!filtered || filtered.length === 0) && (
            <div style={{ opacity: 0.8, padding: 8 }}>Aucun membre trouvé.</div>
          )}
        </div>
      </div>
    </div>
  );
}
