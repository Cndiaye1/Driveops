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

  // ---- Global admin / multi-sites (optionnel)
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  // site cible admin (indépendant du site opérationnel tant que non cliqué "Utiliser dans l'app")
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

  // ---------------- UI (simple + dark + lisibilité selects)
  const ui = {
    page: {
      padding: 16,
      maxWidth: 980,
      margin: "0 auto",
      color: "#e5e7eb",
    },
    card: {
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14,
      padding: 14,
      background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.015))",
      boxShadow: "0 8px 20px rgba(0,0,0,0.16)",
    },
    sectionTitle: {
      margin: 0,
      fontSize: 18,
      fontWeight: 800,
      letterSpacing: "0.2px",
    },
    label: {
      display: "block",
      fontSize: 12,
      opacity: 0.8,
      marginBottom: 6,
      fontWeight: 600,
    },
    input: {
      width: "100%",
      background: "#0f172a",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    select: {
      width: "100%",
      background: "#0f172a",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    option: {
      backgroundColor: "#0f172a",
      color: "#e5e7eb",
    },
    btn: {
      background: "#1f2937",
      color: "#f9fafb",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 12px",
      cursor: "pointer",
      fontWeight: 600,
    },
    btnPrimary: {
      background: "linear-gradient(180deg, #2563eb, #1d4ed8)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 12px",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 8px 18px rgba(37,99,235,0.25)",
    },
    btnDanger: {
      background: "rgba(127,29,29,0.22)",
      color: "#fecaca",
      border: "1px solid rgba(239,68,68,0.35)",
      borderRadius: 10,
      padding: "10px 12px",
      cursor: "pointer",
      fontWeight: 600,
    },
    btnGhost: {
      background: "rgba(255,255,255,0.03)",
      color: "#f3f4f6",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 12px",
      cursor: "pointer",
      fontWeight: 600,
    },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 12,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      whiteSpace: "nowrap",
    },
    muted: { opacity: 0.75, fontSize: 12 },
    grid2: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
    },
    grid3: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 160px",
      gap: 10,
    },
    row: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    },
    memberRow: {
      display: "grid",
      gridTemplateColumns: "1fr 200px 220px",
      gap: 10,
      alignItems: "center",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 12,
      padding: 10,
      background: "rgba(255,255,255,0.015)",
    },
  };

  // Responsive helper (simple)
  const isNarrow = typeof window !== "undefined" ? window.innerWidth < 760 : false;

  // adminSite init/sync
  useEffect(() => {
    setAdminSite((prev) => prev || normalizedSite || "");
  }, [normalizedSite]);

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

      setMsg({ type: "success", text: `Site prêt : ${code}` });
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
      return setMsg({ type: "error", text: "Impossible : dernier admin du site." });
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
      return setMsg({ type: "error", text: "Impossible : dernier admin du site." });
    }

    const targetSite = (adminSite || "").trim().toLowerCase();
    const ok = window.confirm(
      `Supprimer "${memberCode || shortUuid(userId)}" du site ${targetSite} ?`
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
      setMsg({ type: "success", text: "Membre supprimé." });
      await loadMembers();
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Erreur remove-member" });
    } finally {
      setRowLoading(userId, false);
    }
  }

  const targetSiteLabel = (adminSite || "").trim().toLowerCase() || "—";

  return (
    <div style={ui.page}>
      {/* Header compact */}
      <div style={{ ...ui.card, marginBottom: 14 }}>
        <div style={{ ...ui.row, justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>⚙️ Administration</h2>

            <div style={{ ...ui.row, marginTop: 8 }}>
              <span style={ui.badge}>
                Site app: <b>{normalizedSite || "—"}</b>
              </span>
              <span style={ui.badge}>
                Rôle: <b>{memberRole || "—"}</b>
              </span>
              {isGlobalAdmin && <span style={ui.badge}>🌍 Global admin</span>}
            </div>

            {sessionInfo.email ? (
              <div style={{ ...ui.muted, marginTop: 8 }}>
                Connecté : <b>{sessionInfo.email}</b>
              </div>
            ) : null}
          </div>

          <div style={{ ...ui.row }}>
            <button type="button" onClick={goSetup} style={ui.btnGhost}>
              ← Setup
            </button>
            <button type="button" onClick={goCockpit} style={ui.btnGhost}>
              Cockpit
            </button>
            <button type="button" onClick={logout} style={ui.btnDanger}>
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* Site cible */}
      <div style={{ ...ui.card, marginBottom: 14 }}>
        <div style={{ ...ui.row, justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={ui.sectionTitle}>🏪 Site cible</h3>
          <span style={ui.badge}>Site actuel : {targetSiteLabel}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr auto auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <label style={ui.label}>Choisir un site</label>
            {isGlobalAdmin && sites.length > 0 ? (
              <select
                value={targetSiteLabel}
                onChange={(e) => setAdminSite(String(e.target.value || "").trim().toLowerCase())}
                style={ui.select}
              >
                {sites.map((s) => {
                  const code = String(s.site_code || s.code || "").trim().toLowerCase();
                  const name = String(s.name || "").trim();
                  return (
                    <option key={code} value={code} style={ui.option}>
                      {name ? `${name} (${code})` : code}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input value={targetSiteLabel} readOnly style={ui.input} />
            )}
          </div>

          <button type="button" onClick={loadMembers} disabled={membersLoading} style={ui.btn}>
            {membersLoading ? "..." : "Voir membres"}
          </button>

          <button
            type="button"
            onClick={() => setSiteCode?.(targetSiteLabel)}
            disabled={!targetSiteLabel || targetSiteLabel === "—"}
            title="Utiliser ce site dans Setup/Cockpit"
            style={ui.btnPrimary}
          >
            Utiliser dans l’app
          </button>
        </div>

        {/* Create site (global admin only) */}
        {isGlobalAdmin ? (
          <form onSubmit={createSite} style={{ marginTop: 14 }}>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 14,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>➕ Créer un site</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr 160px",
                  gap: 10,
                }}
              >
                <div>
                  <label style={ui.label}>Code</label>
                  <input
                    value={siteForm.code}
                    onChange={(e) => setSiteForm((s) => ({ ...s, code: e.target.value }))}
                    placeholder="ex: melun"
                    style={ui.input}
                  />
                </div>

                <div>
                  <label style={ui.label}>Nom (optionnel)</label>
                  <input
                    value={siteForm.name}
                    onChange={(e) => setSiteForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="ex: Melun"
                    style={ui.input}
                  />
                </div>

                <div style={{ alignSelf: "end" }}>
                  <button type="submit" disabled={siteCreating} style={{ ...ui.btnPrimary, width: "100%" }}>
                    {siteCreating ? "..." : "Créer"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : null}
      </div>

      {!canManage && (
        <div style={{ ...ui.card, marginBottom: 14, borderColor: "rgba(245,158,11,0.3)" }}>
          <b>Accès limité.</b> Tu dois être <b>admin</b> pour gérer les membres.
        </div>
      )}

      {/* Form membre */}
      <form
        onSubmit={onSubmit}
        style={{
          ...ui.card,
          marginBottom: 14,
          opacity: canManage ? 1 : 0.6,
          pointerEvents: canManage ? "auto" : "none",
        }}
      >
        <div style={{ ...ui.row, justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={ui.sectionTitle}>👤 Créer / mettre à jour un membre</h3>
          <span style={ui.badge}>Site : {targetSiteLabel}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
            gap: 10,
          }}
        >
          <div>
            <label style={ui.label}>CODE</label>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="ex: p01 / bamba / cheikh"
              style={ui.input}
            />
          </div>

          <div>
            <label style={ui.label}>PIN</label>
            <input
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              placeholder="ex: 1234"
              style={ui.input}
            />
          </div>

          <div>
            <label style={ui.label}>Rôle</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={ui.select}
            >
              <option value="user" style={ui.option}>user</option>
              <option value="manager" style={ui.option}>manager</option>
              <option value="admin" style={ui.option}>admin</option>
            </select>
          </div>

          <div>
            <label style={ui.label}>Nom (optionnel)</label>
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="ex: Bamba"
              style={ui.input}
            />
          </div>
        </div>

        <button disabled={loading} style={{ ...ui.btnPrimary, marginTop: 12, width: "100%" }}>
          {loading ? "..." : "Créer / Mettre à jour"}
        </button>
      </form>

      {/* Message */}
      {msg && (
        <div
          style={{
            ...ui.card,
            marginBottom: 14,
            borderColor:
              msg.type === "error" ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.25)",
            background:
              msg.type === "error"
                ? "rgba(127,29,29,0.08)"
                : "rgba(22,101,52,0.08)",
          }}
        >
          <b>{msg.type === "error" ? "Erreur" : "OK"}</b> — {msg.text}
        </div>
      )}

      {/* Liste membres */}
      <div style={ui.card}>
        <div style={{ ...ui.row, justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h3 style={ui.sectionTitle}>👥 Membres</h3>
            <div style={{ ...ui.row, marginTop: 8 }}>
              <span style={ui.badge}>Site : {targetSiteLabel}</span>
              <span style={ui.badge}>Admins : {adminCount}</span>
              <span style={ui.badge}>Total : {members.length}</span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "260px auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche…"
              style={{ ...ui.input, minWidth: isNarrow ? 0 : 220 }}
            />
            <button type="button" onClick={loadMembers} disabled={membersLoading} style={ui.btn}>
              {membersLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {(filtered || []).map((m) => {
            const uid = m.user_id;
            const rowBusy = !!actionLoading[uid];
            const role = String(m.role || "").toLowerCase();

            const createdLabel = m.created_at
              ? new Date(m.created_at).toLocaleDateString()
              : "";

            return (
              <div
                key={`${m.site_code}:${uid}`}
                style={{
                  ...(isNarrow
                    ? {
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.015)",
                        opacity: rowBusy ? 0.7 : 1,
                      }
                    : ui.memberRow),
                  opacity: rowBusy ? 0.7 : 1,
                }}
              >
                {/* Col 1 : identité (sans UUID affiché) */}
                <div style={isNarrow ? { marginBottom: 10 } : undefined}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {m.member_code || "membre"}
                    </div>

                    {m.full_name ? (
                      <div style={{ opacity: 0.85, fontSize: 13 }}>{m.full_name}</div>
                    ) : null}

                    <span
                      style={{
                        ...ui.badge,
                        fontSize: 11,
                        padding: "3px 8px",
                        background:
                          role === "admin"
                            ? "rgba(220,38,38,0.12)"
                            : role === "manager"
                            ? "rgba(59,130,246,0.12)"
                            : "rgba(255,255,255,0.03)",
                        borderColor:
                          role === "admin"
                            ? "rgba(220,38,38,0.30)"
                            : role === "manager"
                            ? "rgba(59,130,246,0.30)"
                            : "rgba(255,255,255,0.10)",
                      }}
                    >
                      {role}
                    </span>
                  </div>

                  {createdLabel ? (
                    <div style={{ ...ui.muted, marginTop: 4 }}>Créé le {createdLabel}</div>
                  ) : null}
                </div>

                {/* Col 2 : rôle */}
                <div style={isNarrow ? { marginBottom: 10 } : undefined}>
                  <label style={ui.label}>Rôle</label>
                  <select
                    value={role}
                    disabled={!canManage || rowBusy}
                    onChange={(e) => updateRole(uid, e.target.value)}
                    title={!canManage ? "Accès admin requis" : ""}
                    style={ui.select}
                  >
                    <option value="user" style={ui.option}>user</option>
                    <option value="manager" style={ui.option}>manager</option>
                    <option value="admin" style={ui.option}>admin</option>
                  </select>

                  {isLastAdmin(uid) && (
                    <div style={{ ...ui.muted, marginTop: 6, color: "#fca5a5" }}>
                      ⚠️ Dernier admin
                    </div>
                  )}
                </div>

                {/* Col 3 : actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: isNarrow ? "flex-start" : "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    disabled={!canManage || rowBusy}
                    onClick={() => resetPin(uid, m.member_code)}
                    style={ui.btnGhost}
                  >
                    {actionLoading[uid] === "pin" ? "..." : "Reset PIN"}
                  </button>

                  <button
                    type="button"
                    disabled={!canManage || rowBusy || uid === sessionInfo.id || isLastAdmin(uid)}
                    onClick={() => removeMember(uid, m.member_code)}
                    title={uid === sessionInfo.id ? "Impossible de te supprimer toi-même" : ""}
                    style={{
                      ...ui.btnDanger,
                      opacity:
                        !canManage || rowBusy || uid === sessionInfo.id || isLastAdmin(uid)
                          ? 0.55
                          : 1,
                      cursor:
                        !canManage || rowBusy || uid === sessionInfo.id || isLastAdmin(uid)
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {actionLoading[uid] === "delete" ? "..." : "Supprimer"}
                  </button>
                </div>
              </div>
            );
          })}

          {!membersLoading && (!filtered || filtered.length === 0) && (
            <div style={{ ...ui.muted, padding: 8 }}>Aucun membre trouvé.</div>
          )}
        </div>
      </div>
    </div>
  );
}
