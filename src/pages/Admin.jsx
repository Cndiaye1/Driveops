// src/pages/Admin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

function shortUuid(u) {
  if (!u) return "";
  return `${u.slice(0, 8)}…${u.slice(-6)}`;
}

function chipStyle(kind = "default") {
  const map = {
    default: {
      background: "rgba(148,163,184,0.12)",
      color: "#cbd5e1",
      border: "1px solid rgba(148,163,184,0.22)",
    },
    success: {
      background: "rgba(34,197,94,0.12)",
      color: "#86efac",
      border: "1px solid rgba(34,197,94,0.22)",
    },
    danger: {
      background: "rgba(239,68,68,0.12)",
      color: "#fca5a5",
      border: "1px solid rgba(239,68,68,0.22)",
    },
    warn: {
      background: "rgba(245,158,11,0.12)",
      color: "#fcd34d",
      border: "1px solid rgba(245,158,11,0.22)",
    },
    info: {
      background: "rgba(59,130,246,0.12)",
      color: "#93c5fd",
      border: "1px solid rgba(59,130,246,0.22)",
    },
    purple: {
      background: "rgba(168,85,247,0.12)",
      color: "#d8b4fe",
      border: "1px solid rgba(168,85,247,0.22)",
    },
  };
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    ...map[kind],
  };
}

const ui = {
  page: {
    padding: 16,
    maxWidth: 1180,
    margin: "0 auto",
    color: "#eef2ff",
  },

  panel: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    background: "rgba(10,14,24,0.82)",
    backdropFilter: "blur(8px)",
    padding: 14,
    boxShadow: "0 8px 30px rgba(0,0,0,0.22)",
  },

  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 0.2,
  },

  muted: {
    opacity: 0.78,
    fontSize: 13,
  },

  tiny: {
    opacity: 0.68,
    fontSize: 12,
  },

  topRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  actionsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },

  button: {
    minHeight: 38,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    cursor: "pointer",
    fontWeight: 600,
  },

  buttonPrimary: {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid rgba(59,130,246,0.35)",
    background: "rgba(59,130,246,0.18)",
    color: "#dbeafe",
    cursor: "pointer",
    fontWeight: 700,
  },

  buttonDanger: {
    minHeight: 38,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.30)",
    background: "rgba(239,68,68,0.12)",
    color: "#fecaca",
    cursor: "pointer",
    fontWeight: 600,
  },

  input: {
    width: "100%",
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(10,14,24,0.9)",
    color: "#eef2ff",
    padding: "0 12px",
    outline: "none",
    boxSizing: "border-box",
  },

  // ✅ important: select fermé en dark, options lisibles en blanc/noir
  select: {
    width: "100%",
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(10,14,24,0.9)",
    color: "#eef2ff",
    padding: "0 12px",
    outline: "none",
    boxSizing: "border-box",
  },

  // ✅ pour Windows/Chrome dropdown natif
  option: {
    background: "#ffffff",
    color: "#111827",
  },

  label: {
    display: "grid",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: "#dbe4ff",
  },

  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
  },

  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },

  notice: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
  },

  messageBox: (type) => ({
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border:
      type === "error"
        ? "1px solid rgba(239,68,68,0.28)"
        : "1px solid rgba(34,197,94,0.28)",
    background:
      type === "error"
        ? "rgba(239,68,68,0.08)"
        : "rgba(34,197,94,0.08)",
    color: type === "error" ? "#fecaca" : "#dcfce7",
  }),

  subHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  memberCard: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    padding: 12,
    background: "rgba(255,255,255,0.03)",
    display: "grid",
    gap: 10,
  },

  memberTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  memberName: {
    fontWeight: 800,
    fontSize: 15,
    color: "#f8fafc",
    lineHeight: 1.25,
  },

  memberMeta: {
    opacity: 0.78,
    fontSize: 12,
    marginTop: 4,
  },

  memberControls: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 220px) 1fr",
    gap: 10,
    alignItems: "end",
  },

  memberControlsMobileSafe: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    alignItems: "end",
  },

  rowRightButtons: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    flexWrap: "wrap",
    alignItems: "center",
  },

  divider: {
    height: 1,
    background: "rgba(255,255,255,0.08)",
    margin: "10px 0",
  },

  kpiRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 10,
  },
};

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
      // endpoint absent / non autorisé => on reste en mono-site sans casser
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

  // charge list-sites (si dispo)
  useEffect(() => {
    loadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recharge les membres quand le site cible change
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
  const roleLabel = String(memberRole || "").toLowerCase();

  function roleKind(r) {
    if (r === "admin") return "danger";
    if (r === "manager") return "warn";
    if (r === "user") return "info";
    return "default";
  }

  return (
    <div style={ui.page}>
      {/* Header */}
      <div style={{ ...ui.panel, padding: 16 }}>
        <div style={ui.topRow}>
          <div style={{ minWidth: 260, flex: "1 1 420px" }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: 0.2 }}>
              🛠️ Administration
            </h2>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={chipStyle("info")}>Site app: {normalizedSite || "—"}</span>
              <span style={chipStyle(roleKind(roleLabel))}>Rôle: {memberRole || "—"}</span>
              {isGlobalAdmin ? <span style={chipStyle("purple")}>🌍 Global admin</span> : null}
            </div>

            {/* Détails techniques repliés (propre, sans exposer au premier regard) */}
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", opacity: 0.75, fontSize: 12 }}>
                Détails techniques (session / API)
              </summary>
              <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                <div style={ui.tiny}>
                  Session: <b>{sessionInfo.email || "—"}</b> · <span>{shortUuid(sessionInfo.id)}</span>
                </div>
                <div style={ui.tiny}>
                  API base: <b>{API_BASE || "(same origin)"}</b>
                </div>
              </div>
            </details>
          </div>

          <div style={ui.actionsRow}>
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
      </div>

      {/* Bloc Site / Multi-site */}
      <div style={{ ...ui.panel, marginTop: 14 }}>
        <div style={ui.subHeaderRow}>
          <div>
            <h3 style={ui.sectionTitle}>🏢 Site cible (Admin)</h3>
            <div style={ui.muted}>
              Gère les membres du site sélectionné sans changer automatiquement le site opérationnel.
            </div>
          </div>

          <div style={ui.kpiRow}>
            <span style={chipStyle("info")}>Cible: {targetSiteLabel}</span>
            {normalizedSite && targetSiteLabel !== normalizedSite ? (
              <span style={chipStyle("warn")}>Différent du site de l’app</span>
            ) : (
              <span style={chipStyle("success")}>Même site que l’app</span>
            )}
          </div>
        </div>

        <div style={ui.divider} />

        <div style={ui.grid3}>
          <div>
            <label style={ui.label}>
              {isGlobalAdmin && sites.length > 0 ? "Choisir un site" : "Site cible"}
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
                        {code}
                        {name ? ` — ${name}` : ""}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div style={{ ...ui.notice, padding: 10 }}>
                  <div style={{ fontWeight: 800 }}>{targetSiteLabel}</div>
                  <div style={ui.tiny}>
                    {isGlobalAdmin
                      ? "Aucun site renvoyé."
                      : "Mode mono-site (list-sites indisponible ou non autorisé)."}
                  </div>
                </div>
              )}
            </label>
          </div>

          <div>
            <label style={ui.label}>Actions site</label>
            <div style={ui.actionsRow}>
              <button type="button" onClick={loadSites} disabled={sitesLoading} style={ui.button}>
                {sitesLoading ? "..." : "Tester list-sites"}
              </button>

              <button type="button" onClick={loadMembers} disabled={membersLoading} style={ui.button}>
                {membersLoading ? "..." : "Voir membres"}
              </button>

              <button
                type="button"
                onClick={() => setSiteCode?.(targetSiteLabel)}
                disabled={!targetSiteLabel || targetSiteLabel === "—"}
                title="Mettre ce site comme site de l’app (Setup/Cockpit)"
                style={ui.buttonPrimary}
              >
                Utiliser dans l’app
              </button>
            </div>
          </div>

          <div>
            <label style={ui.label}>Statut admin</label>
            <div style={{ ...ui.notice, padding: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={chipStyle(canManage ? "success" : "danger")}>
                  {canManage ? "Accès admin OK" : "Accès limité"}
                </span>
                <span style={chipStyle(isGlobalAdmin ? "purple" : "default")}>
                  {isGlobalAdmin ? "Multi-sites actif" : "Mono-site"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isGlobalAdmin ? (
          <form onSubmit={createSite} style={{ marginTop: 14 }}>
            <div style={{ ...ui.notice }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>➕ Créer un site</div>

              <div style={ui.grid3}>
                <label style={ui.label}>
                  Code site
                  <input
                    value={siteForm.code}
                    onChange={(e) => setSiteForm((s) => ({ ...s, code: e.target.value }))}
                    placeholder="ex: melun"
                    style={ui.input}
                  />
                </label>

                <label style={ui.label}>
                  Nom (optionnel)
                  <input
                    value={siteForm.name}
                    onChange={(e) => setSiteForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="ex: Melun"
                    style={ui.input}
                  />
                </label>

                <div style={{ display: "grid", alignItems: "end" }}>
                  <button type="submit" disabled={siteCreating} style={ui.buttonPrimary}>
                    {siteCreating ? "..." : "Créer le site"}
                  </button>
                </div>
              </div>

              <div style={{ ...ui.tiny, marginTop: 8 }}>
                Si l’endpoint <code>/api/admin/site-create</code> n’existe pas encore, cette action ne
                marchera pas (la page reste stable).
              </div>
            </div>
          </form>
        ) : null}
      </div>

      {!canManage && (
        <div style={{ ...ui.panel, marginTop: 14, borderColor: "rgba(245,158,11,0.22)" }}>
          <div style={{ color: "#fde68a", fontWeight: 700 }}>
            ⚠️ Accès limité
          </div>
          <div style={{ marginTop: 6, ...ui.muted }}>
            Tu dois être <b>admin</b> (ou <b>global admin</b>) pour créer / modifier / supprimer des membres.
          </div>
        </div>
      )}

      {/* Formulaire membre */}
      <form
        onSubmit={onSubmit}
        style={{
          ...ui.panel,
          marginTop: 16,
          opacity: canManage ? 1 : 0.6,
          pointerEvents: canManage ? "auto" : "none",
        }}
      >
        <div style={ui.subHeaderRow}>
          <div>
            <h3 style={ui.sectionTitle}>👤 Créer / mettre à jour un membre</h3>
            <div style={ui.muted}>Création ou mise à jour via CODE + PIN sur le site cible.</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={chipStyle("info")}>Site cible: {targetSiteLabel}</span>
            <span style={chipStyle("default")}>Rôles: user / manager / admin</span>
          </div>
        </div>

        <div style={ui.divider} />

        <div style={ui.grid2}>
          <label style={ui.label}>
            CODE
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="ex: p01 / bamba / cheikh"
              style={ui.input}
            />
          </label>

          <label style={ui.label}>
            PIN
            <input
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              placeholder="ex: 1234"
              style={ui.input}
            />
          </label>

          <label style={ui.label}>
            Rôle
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={ui.select}
            >
              <option value="user" style={ui.option}>user</option>
              <option value="manager" style={ui.option}>manager</option>
              <option value="admin" style={ui.option}>admin</option>
            </select>
          </label>

          <label style={ui.label}>
            Nom (optionnel)
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="ex: Bamba"
              style={ui.input}
            />
          </label>
        </div>

        <button disabled={loading} style={{ ...ui.buttonPrimary, marginTop: 12, width: "100%" }}>
          {loading ? "..." : "Créer / Mettre à jour"}
        </button>
      </form>

      {/* Message global */}
      {msg && (
        <div style={ui.messageBox(msg.type)}>
          <b>{msg.type === "error" ? "Erreur" : "OK"}</b> — {msg.text}
        </div>
      )}

      {/* Liste des membres */}
      <div style={{ ...ui.panel, marginTop: 16 }}>
        <div style={ui.subHeaderRow}>
          <div>
            <h3 style={ui.sectionTitle}>👥 Membres du site</h3>
            <div style={ui.muted}>Recherche, rôles, reset PIN, suppression.</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche (code / rôle / nom)…"
              style={{ ...ui.input, minWidth: 260 }}
            />
            <button type="button" onClick={loadMembers} disabled={membersLoading} style={ui.button}>
              {membersLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div style={ui.kpiRow}>
          <span style={chipStyle("info")}>Site: {targetSiteLabel}</span>
          <span style={chipStyle("danger")}>Admins: {adminCount}</span>
          <span style={chipStyle("default")}>Total: {(members || []).length}</span>
          {q ? <span style={chipStyle("warn")}>Filtrés: {(filtered || []).length}</span> : null}
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {(filtered || []).map((m) => {
            const uid = m.user_id;
            const rowBusy = !!actionLoading[uid];
            const role = String(m.role || "").toLowerCase();
            const canDelete = canManage && !rowBusy && uid !== sessionInfo.id && !isLastAdmin(uid);

            return (
              <div
                key={`${m.site_code}:${uid}`}
                style={{
                  ...ui.memberCard,
                  opacity: rowBusy ? 0.7 : 1,
                  borderColor: rowBusy
                    ? "rgba(59,130,246,0.22)"
                    : "rgba(255,255,255,0.10)",
                }}
              >
                <div style={ui.memberTop}>
                  <div style={{ minWidth: 220, flex: "1 1 320px" }}>
                    <div style={ui.memberName}>
                      {m.member_code ? m.member_code : shortUuid(uid)}{" "}
                      {m.full_name ? (
                        <span style={{ opacity: 0.82, fontWeight: 600 }}>· {m.full_name}</span>
                      ) : null}
                    </div>

                    <div style={ui.memberMeta}>
                      {m.created_at ? new Date(m.created_at).toLocaleString() : "—"} ·{" "}
                      <span>{shortUuid(uid)}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={chipStyle(roleKind(role))}>{role || "—"}</span>
                    {uid === sessionInfo.id ? <span style={chipStyle("default")}>Toi</span> : null}
                    {isLastAdmin(uid) ? <span style={chipStyle("warn")}>⚠️ Dernier admin</span> : null}
                  </div>
                </div>

                <div style={ui.memberControlsMobileSafe}>
                  <label style={{ ...ui.label, margin: 0 }}>
                    Rôle
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
                  </label>

                  <div style={ui.rowRightButtons}>
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
                      disabled={!canDelete}
                      onClick={() => removeMember(uid, m.member_code)}
                      style={ui.buttonDanger}
                      title={uid === sessionInfo.id ? "Impossible de te supprimer toi-même" : ""}
                    >
                      {actionLoading[uid] === "delete" ? "..." : "Supprimer"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!membersLoading && (!filtered || filtered.length === 0) && (
            <div style={{ ...ui.notice, textAlign: "center", opacity: 0.85 }}>
              Aucun membre trouvé.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
