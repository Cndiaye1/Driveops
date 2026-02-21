// src/pages/Admin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

function shortUuid(u) {
  if (!u) return "";
  return `${u.slice(0, 8)}…${u.slice(-6)}`;
}

const UI = {
  page: {
    padding: 16,
    maxWidth: 980,
    margin: "0 auto",
    color: "#E8EEF8",
  },
  card: {
    background: "rgba(8, 14, 28, 0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  sub: {
    marginTop: 4,
    opacity: 0.72,
    fontSize: 12,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
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
  label: {
    display: "grid",
    gap: 6,
    fontSize: 12,
    opacity: 0.9,
  },
  input: {
    width: "100%",
    height: 38,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    color: "#EAF1FF",
    padding: "0 12px",
    outline: "none",
  },
  select: {
    width: "100%",
    height: 38,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0B1220",
    color: "#EAF1FF",
    padding: "0 12px",
    outline: "none",
  },
  btn: {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "#EAF1FF",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnPrimary: {
    height: 38,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid rgba(59,130,246,0.45)",
    background: "rgba(37, 99, 235, 0.20)",
    color: "#EAF1FF",
    cursor: "pointer",
    fontWeight: 700,
  },
  btnDanger: {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.12)",
    color: "#FFD6D6",
    cursor: "pointer",
    fontWeight: 600,
  },
  btnGhost: {
    height: 32,
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.02)",
    color: "#DCE7FF",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    fontSize: 11,
    fontWeight: 700,
  },
  chipGreen: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(34,197,94,0.25)",
    background: "rgba(34,197,94,0.10)",
    color: "#BBF7D0",
    fontSize: 11,
    fontWeight: 700,
  },
  chipPurple: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(168,85,247,0.25)",
    background: "rgba(168,85,247,0.10)",
    color: "#E9D5FF",
    fontSize: 11,
    fontWeight: 700,
  },
  chipRed: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(239,68,68,0.25)",
    background: "rgba(239,68,68,0.10)",
    color: "#FECACA",
    fontSize: 11,
    fontWeight: 700,
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.08)",
    margin: "12px 0",
  },
  msgOk: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(34,197,94,0.25)",
    background: "rgba(34,197,94,0.08)",
    color: "#D1FAE5",
    fontSize: 13,
  },
  msgErr: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.25)",
    background: "rgba(239,68,68,0.08)",
    color: "#FECACA",
    fontSize: 13,
  },
  smallMuted: {
    fontSize: 11,
    opacity: 0.65,
  },
};

function OptionSafeStyle() {
  // Petit helper visuel : certains navigateurs ignorent le style des <option>
  // mais on garde au moins le select en fond sombre.
  return null;
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

  // site cible pour l’admin
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

  const topStats = [
    { label: "Site app", value: normalizedSite || "—", tone: "default" },
    { label: "Rôle", value: memberRole || "—", tone: isAdmin ? "green" : "default" },
    ...(isGlobalAdmin ? [{ label: "Global", value: "admin", tone: "purple" }] : []),
  ];

  return (
    <div style={UI.page}>
      <OptionSafeStyle />

      {/* HEADER */}
      <div style={{ ...UI.card, padding: 16 }}>
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
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Administration</h2>
            <div style={UI.sub}>Gestion des membres et des sites (mode sécurisé).</div>

            <div style={{ ...UI.row, marginTop: 10 }}>
              {topStats.map((x) => {
                const style =
                  x.tone === "green"
                    ? UI.chipGreen
                    : x.tone === "purple"
                    ? UI.chipPurple
                    : UI.chip;
                return (
                  <span key={`${x.label}-${x.value}`} style={style}>
                    {x.label}: {x.value}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={{ ...UI.row, justifyContent: "flex-end" }}>
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

        {/* Infos minimales (email OK, ID masqué) */}
        <div style={{ ...UI.smallMuted, marginTop: 10 }}>
          Connecté : <b style={{ opacity: 0.95 }}>{sessionInfo.email || "—"}</b>
        </div>
      </div>

      {/* SITE CIBLE */}
      <div style={{ ...UI.card, marginTop: 14 }}>
        <div style={UI.row}>
          <h3 style={{ ...UI.sectionTitle, fontSize: 17 }}>Site cible (Admin)</h3>
          <span style={UI.smallMuted}>
            Gère les membres du site sélectionné sans changer automatiquement le site opérationnel.
          </span>
        </div>

        <div style={UI.divider} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isGlobalAdmin && sites.length > 0 ? "1fr auto auto auto" : "1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={UI.label}>
            <span>Choisir un site</span>

            {isGlobalAdmin && sites.length > 0 ? (
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
                      {code}{name ? ` — ${name}` : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input value={targetSiteLabel} readOnly style={UI.input} />
            )}
          </label>

          <button type="button" onClick={loadMembers} disabled={membersLoading} style={UI.btn}>
            {membersLoading ? "..." : "Voir membres"}
          </button>

          {isGlobalAdmin && (
            <button
              type="button"
              onClick={() => setSiteCode?.(targetSiteLabel)}
              disabled={!targetSiteLabel}
              title="Mettre ce site comme site de l’app (Setup/Cockpit)"
              style={UI.btn}
            >
              Utiliser dans l’app
            </button>
          )}

          {!isGlobalAdmin && (
            <button type="button" onClick={loadSites} disabled={sitesLoading} style={UI.btn}>
              {sitesLoading ? "..." : "Tester multi-site"}
            </button>
          )}
        </div>

        <div style={{ ...UI.row, marginTop: 10 }}>
          {canManage ? <span style={UI.chipGreen}>Accès admin OK</span> : <span style={UI.chipRed}>Accès limité</span>}
          {isGlobalAdmin ? <span style={UI.chipPurple}>Multi-site actif</span> : null}
        </div>

        {isGlobalAdmin ? (
          <>
            <div style={UI.divider} />

            <form onSubmit={createSite} style={{ display: "grid", gap: 10 }}>
              <h4 style={{ margin: 0, fontSize: 15 }}>Créer un site</h4>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 150px",
                  gap: 10,
                }}
              >
                <input
                  value={siteForm.code}
                  onChange={(e) => setSiteForm((s) => ({ ...s, code: e.target.value }))}
                  placeholder="Code (ex: melun)"
                  style={UI.input}
                />
                <input
                  value={siteForm.name}
                  onChange={(e) => setSiteForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Nom (optionnel)"
                  style={UI.input}
                />
                <button type="submit" disabled={siteCreating} style={UI.btnPrimary}>
                  {siteCreating ? "..." : "Créer"}
                </button>
              </div>

              <div style={UI.smallMuted}>
                Si l’endpoint site-create n’existe pas encore, cette action peut ne pas fonctionner.
              </div>
            </form>
          </>
        ) : null}
      </div>

      {/* CREATE/UPDATE MEMBER */}
      <form
        onSubmit={onSubmit}
        style={{
          ...UI.card,
          marginTop: 14,
          opacity: canManage ? 1 : 0.65,
          pointerEvents: canManage ? "auto" : "none",
        }}
      >
        <div style={UI.row}>
          <h3 style={{ ...UI.sectionTitle, fontSize: 17 }}>Créer / mettre à jour un membre</h3>
          <span style={UI.smallMuted}>Création ou mise à jour via CODE + PIN sur le site cible.</span>
        </div>

        <div style={UI.divider} />

        <div style={{ ...UI.row, marginBottom: 10 }}>
          <span style={UI.chip}>Site cible: {targetSiteLabel}</span>
          <span style={UI.chip}>Rôles: user / manager / admin</span>
        </div>

        <div style={UI.grid2}>
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
        <div style={msg.type === "error" ? UI.msgErr : UI.msgOk}>
          <b>{msg.type === "error" ? "Erreur" : "OK"}</b> — {msg.text}
        </div>
      )}

      {/* MEMBERS */}
      <div style={{ ...UI.card, marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ ...UI.sectionTitle, fontSize: 17 }}>Membres du site</h3>
            <div style={UI.sub}>Recherche, rôles, reset PIN, suppression.</div>
          </div>

          <div style={{ ...UI.row }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche (code / rôle / nom)…"
              style={{ ...UI.input, minWidth: 240 }}
            />
            <button type="button" onClick={loadMembers} disabled={membersLoading} style={UI.btn}>
              {membersLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div style={UI.divider} />

        <div style={{ ...UI.row, marginBottom: 8 }}>
          <span style={UI.chip}>Site: {targetSiteLabel}</span>
          <span style={UI.chipRed}>Admins: {adminCount}</span>
          <span style={UI.chip}>Total: {filtered?.length || 0}</span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {(filtered || []).map((m) => {
            const uid = m.user_id;
            const rowBusy = !!actionLoading[uid];
            const role = String(m.role || "").toLowerCase();
            const isMe = uid === sessionInfo.id;

            return (
              <div
                key={`${m.site_code}:${uid}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 12,
                  padding: 10,
                  background: "rgba(255,255,255,0.02)",
                  opacity: rowBusy ? 0.7 : 1,
                }}
              >
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
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {m.member_code || "membre"}
                      {m.full_name ? (
                        <span style={{ opacity: 0.8, fontWeight: 500 }}> · {m.full_name}</span>
                      ) : null}
                    </div>

                    <div style={{ ...UI.smallMuted, marginTop: 2 }}>
                      {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                    </div>
                  </div>

                  <div style={{ ...UI.row }}>
                    {role === "admin" ? <span style={UI.chipRed}>admin</span> : null}
                    {isMe ? <span style={UI.chip}>Toi</span> : null}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 8,
                    alignItems: "end",
                  }}
                >
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
                    title={isMe ? "Impossible de te supprimer toi-même" : ""}
                    style={UI.btnDanger}
                  >
                    {actionLoading[uid] === "delete" ? "..." : "Supprimer"}
                  </button>
                </div>

                {isLastAdmin(uid) && (
                  <div style={{ ...UI.smallMuted, marginTop: 8 }}>
                    ⚠️ Dernier admin du site (suppression / rétrogradation bloquées)
                  </div>
                )}
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
