import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

function shortUuid(u) {
  if (!u) return "";
  return `${u.slice(0, 8)}…${u.slice(-6)}`;
}

function roleColor(role) {
  const r = String(role || "").toLowerCase();
  if (r === "admin") return "#7dd3fc";
  if (r === "manager") return "#fbbf24";
  return "#a7f3d0";
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

  const [showDebug, setShowDebug] = useState(false);

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

  // ---- UI styles (inline pour ne rien casser dans le projet)
  const ui = {
    page: {
      padding: 16,
      maxWidth: 1100,
      margin: "0 auto",
      color: "#eef2ff",
    },
    card: {
      marginTop: 14,
      padding: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      background: "rgba(255,255,255,0.02)",
      backdropFilter: "blur(4px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    },
    title: {
      margin: 0,
      fontSize: 28,
      fontWeight: 800,
      letterSpacing: "-0.02em",
    },
    sub: { opacity: 0.85, fontSize: 13, marginTop: 6 },
    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    button: {
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.04)",
      color: "#fff",
      borderRadius: 10,
      padding: "8px 12px",
      cursor: "pointer",
    },
    buttonPrimary: {
      border: "1px solid rgba(255,255,255,0.15)",
      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
      color: "#fff",
      borderRadius: 10,
      padding: "9px 12px",
      cursor: "pointer",
      fontWeight: 700,
    },
    buttonDanger: {
      border: "1px solid rgba(239,68,68,0.35)",
      background: "rgba(239,68,68,0.08)",
      color: "#fecaca",
      borderRadius: 10,
      padding: "8px 12px",
      cursor: "pointer",
    },
    badge: (bg = "rgba(255,255,255,0.06)", color = "#fff") => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      border: "1px solid rgba(255,255,255,0.1)",
      background: bg,
      color,
      borderRadius: 999,
      padding: "5px 10px",
      fontSize: 12,
      fontWeight: 700,
    }),
    input: {
      width: "100%",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.03)",
      color: "#fff",
      padding: "10px 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    label: {
      display: "grid",
      gap: 6,
      fontSize: 13,
      opacity: 0.95,
    },
    sectionTitle: {
      margin: 0,
      fontSize: 18,
      fontWeight: 800,
    },
    muted: { opacity: 0.7, fontSize: 12 },
  };

  return (
    <div style={ui.page}>
      {/* Header */}
      <div style={ui.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 260 }}>
            <h2 style={ui.title}>Admin DriveOps</h2>
            <div style={ui.sub}>
              Gestion des accès, rôles et membres du site.
            </div>

            <div style={{ ...ui.row, marginTop: 10 }}>
              <span style={ui.badge("rgba(255,255,255,0.05)", "#e5e7eb")}>
                Site app: <b style={{ marginLeft: 4 }}>{normalizedSite || "—"}</b>
              </span>

              <span
                style={ui.badge(
                  String(memberRole || "").toLowerCase() === "admin"
                    ? "rgba(59,130,246,0.12)"
                    : "rgba(255,255,255,0.05)",
                  "#dbeafe"
                )}
              >
                Rôle: <b style={{ marginLeft: 4 }}>{memberRole || "—"}</b>
              </span>

              {isGlobalAdmin ? (
                <span style={ui.badge("rgba(16,185,129,0.12)", "#a7f3d0")}>🌍 Global admin</span>
              ) : null}
            </div>
          </div>

          <div style={{ ...ui.row, justifyContent: "flex-end" }}>
            <button type="button" onClick={goSetup} style={ui.button}>
              ← Setup
            </button>
            <button type="button" onClick={goCockpit} style={ui.button}>
              Cockpit
            </button>
            <button type="button" onClick={logout} style={ui.buttonDanger}>
              Déconnexion
            </button>
          </div>
        </div>

        {/* Debug technique masqué par défaut */}
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            style={{ ...ui.button, padding: "6px 10px", fontSize: 12 }}
          >
            {showDebug ? "Masquer" : "Afficher"} détails techniques
          </button>

          {showDebug ? (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.02)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <div>
                Session: <b>{sessionInfo.email || "—"}</b> · {shortUuid(sessionInfo.id)}
              </div>
              <div>
                API base: <b>{API_BASE || "(same origin)"}</b>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Message global */}
      {msg && (
        <div
          style={{
            ...ui.card,
            borderColor:
              msg.type === "error"
                ? "rgba(239,68,68,0.35)"
                : "rgba(16,185,129,0.35)",
            background:
              msg.type === "error"
                ? "rgba(239,68,68,0.06)"
                : "rgba(16,185,129,0.06)",
          }}
        >
          <div style={{ fontWeight: 700 }}>
            {msg.type === "error" ? "Erreur" : "Succès"}
          </div>
          <div style={{ marginTop: 4 }}>{msg.text}</div>
        </div>
      )}

      {/* Bloc sites / ciblage */}
      <div style={ui.card}>
        <div style={{ ...ui.row, justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={ui.sectionTitle}>Site cible (admin)</h3>
          <span style={ui.badge("rgba(255,255,255,0.04)", "#e5e7eb")}>
            Site sélectionné: <b style={{ marginLeft: 4 }}>{targetSiteLabel}</b>
          </span>
        </div>

        <div style={{ ...ui.row, marginTop: 12 }}>
          {isGlobalAdmin && sites.length > 0 ? (
            <>
              <select
                value={targetSiteLabel}
                onChange={(e) => setAdminSite(String(e.target.value || "").trim().toLowerCase())}
                style={{ ...ui.input, maxWidth: 380 }}
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

              <button type="button" onClick={loadMembers} disabled={membersLoading} style={ui.button}>
                {membersLoading ? "Chargement..." : "Voir membres"}
              </button>

              <button
                type="button"
                onClick={() => setSiteCode?.(targetSiteLabel)}
                disabled={!targetSiteLabel}
                title="Mettre ce site comme site de l’app (Setup/Cockpit)"
                style={ui.buttonPrimary}
              >
                Utiliser dans l’app
              </button>
            </>
          ) : (
            <>
              <div style={{ ...ui.input, maxWidth: 300, opacity: 0.85 }}>
                <b>{targetSiteLabel}</b>
              </div>
              <button type="button" onClick={loadSites} disabled={sitesLoading} style={ui.button}>
                {sitesLoading ? "Test..." : "Tester list-sites"}
              </button>
              <span style={ui.muted}>
                {isGlobalAdmin
                  ? "Aucun site renvoyé."
                  : "Mode mono-site (list-sites indisponible ou non autorisé)."}
              </span>
            </>
          )}
        </div>

        {isGlobalAdmin ? (
          <form onSubmit={createSite} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Créer un site</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 140px",
                gap: 10,
              }}
            >
              <input
                value={siteForm.code}
                onChange={(e) => setSiteForm((s) => ({ ...s, code: e.target.value }))}
                placeholder="Code site (ex: melun)"
                style={ui.input}
              />
              <input
                value={siteForm.name}
                onChange={(e) => setSiteForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Nom (optionnel) (ex: Melun)"
                style={ui.input}
              />
              <button type="submit" disabled={siteCreating} style={ui.buttonPrimary}>
                {siteCreating ? "Création..." : "Créer"}
              </button>
            </div>

            <div style={{ ...ui.muted, marginTop: 8 }}>
              Si <code>/api/admin/site-create</code> n’existe pas, cette partie restera inopérante.
            </div>
          </form>
        ) : null}
      </div>

      {!canManage && (
        <div style={ui.card}>
          <div style={{ fontWeight: 700 }}>Accès limité</div>
          <div style={{ marginTop: 4 }}>
            Tu dois être <b>admin</b> (ou <b>global admin</b>) pour gérer les membres.
          </div>
        </div>
      )}

      {/* Form création / MAJ membre */}
      <form
        onSubmit={onSubmit}
        style={{
          ...ui.card,
          opacity: canManage ? 1 : 0.6,
          pointerEvents: canManage ? "auto" : "none",
        }}
      >
        <div style={{ ...ui.row, justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={ui.sectionTitle}>Créer / mettre à jour un membre</h3>
          <span style={ui.badge("rgba(255,255,255,0.04)", "#e5e7eb")}>
            Site cible: <b style={{ marginLeft: 4 }}>{targetSiteLabel}</b>
          </span>
        </div>

        {normalizedSite && targetSiteLabel !== normalizedSite ? (
          <div style={{ ...ui.muted, marginTop: 8 }}>
            ⚠️ Le site cible admin est différent du site actuellement utilisé dans l’app.
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <label style={ui.label}>
            <span>CODE</span>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="ex: p01 / bamba / cheikh"
              style={ui.input}
              autoComplete="off"
            />
          </label>

          <label style={ui.label}>
            <span>PIN</span>
            <input
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              placeholder="ex: 1234"
              style={ui.input}
              autoComplete="new-password"
            />
          </label>

          <label style={ui.label}>
            <span>Rôle</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={ui.input}
            >
              <option value="user">user</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
          </label>

          <label style={ui.label}>
            <span>Nom (optionnel)</span>
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="ex: Bamba"
              style={ui.input}
              autoComplete="off"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ ...ui.buttonPrimary, marginTop: 14, width: "100%" }}
        >
          {loading ? "Traitement..." : "Créer / Mettre à jour"}
        </button>
      </form>

      {/* Liste membres */}
      <div style={ui.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={ui.sectionTitle}>Membres du site</h3>
            <div style={{ ...ui.muted, marginTop: 4 }}>
              Site: <b>{targetSiteLabel}</b> · Admins: <b>{adminCount}</b> · Total:{" "}
              <b>{members.length}</b>
            </div>
          </div>

          <div style={{ ...ui.row }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche (code / rôle / nom)…"
              style={{ ...ui.input, minWidth: 260 }}
            />
            <button type="button" onClick={loadMembers} disabled={membersLoading} style={ui.button}>
              {membersLoading ? "Chargement..." : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {(filtered || []).map((m) => {
            const uid = m.user_id;
            const rowBusy = !!actionLoading[uid];
            const role = String(m.role || "").toLowerCase();

            return (
              <div
                key={`${m.site_code}:${uid}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px,1fr) minmax(180px,220px) minmax(220px,260px)",
                  gap: 10,
                  alignItems: "center",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(255,255,255,0.015)",
                  opacity: rowBusy ? 0.7 : 1,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>
                      {m.member_code ? m.member_code : shortUuid(uid)}
                    </div>

                    <span
                      style={{
                        ...ui.badge("rgba(255,255,255,0.04)", roleColor(role)),
                        padding: "4px 8px",
                        fontSize: 11,
                      }}
                    >
                      {role}
                    </span>

                    {isLastAdmin(uid) ? (
                      <span style={ui.badge("rgba(251,191,36,0.10)", "#fde68a")}>
                        ⚠️ Dernier admin
                      </span>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 4, opacity: 0.9 }}>
                    {m.full_name ? m.full_name : <span style={{ opacity: 0.55 }}>Nom non renseigné</span>}
                  </div>

                  <div style={{ ...ui.muted, marginTop: 4 }}>
                    {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                    {" · "}
                    {showDebug ? shortUuid(uid) : "ID masqué"}
                  </div>
                </div>

                <div>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={ui.muted}>Rôle</span>
                    <select
                      value={role}
                      disabled={!canManage || rowBusy}
                      onChange={(e) => updateRole(uid, e.target.value)}
                      title={!canManage ? "Accès admin requis" : ""}
                      style={ui.input}
                    >
                      <option value="user">user</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={!canManage || rowBusy}
                    onClick={() => resetPin(uid, m.member_code)}
                    style={ui.button}
                  >
                    {actionLoading[uid] === "pin" ? "..." : "Reset PIN"}
                  </button>

                  <button
                    type="button"
                    disabled={!canManage || rowBusy || uid === sessionInfo.id || isLastAdmin(uid)}
                    onClick={() => removeMember(uid, m.member_code)}
                    style={ui.buttonDanger}
                    title={uid === sessionInfo.id ? "Impossible de te supprimer toi-même" : ""}
                  >
                    {actionLoading[uid] === "delete" ? "..." : "Supprimer"}
                  </button>
                </div>
              </div>
            );
          })}

          {!membersLoading && (!filtered || filtered.length === 0) && (
            <div
              style={{
                border: "1px dashed rgba(255,255,255,0.14)",
                borderRadius: 12,
                padding: 14,
                opacity: 0.8,
              }}
            >
              Aucun membre trouvé.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
