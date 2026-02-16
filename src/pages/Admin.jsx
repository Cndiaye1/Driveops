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
    // au départ on cible le site du store
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
      // si tu veux forcer un site pour une requête
      site = adminSite,
      // si endpoint global (pas besoin du header X-Site-Code)
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
      // endpoint global -> pas de X-Site-Code requis
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
      // si endpoint pas présent / pas autorisé => on ne casse pas la page
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
        includeSiteHeader: false, // global
        body: {
          siteCode: code,
          site_code: code, // tolérant
          name: name || null,
        },
      });

      setMsg({ type: "success", text: `Site créé / existant : ${code}` });
      setSiteForm({ code: "", name: "" });
      await loadSites();
      // cible direct le nouveau site dans l’admin
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
            Site (app): <b>{normalizedSite || "—"}</b> · Ton rôle:{" "}
            <b>{memberRole || "—"}</b>
            {isGlobalAdmin ? (
              <span style={{ marginLeft: 8, opacity: 0.85 }}>· 🌍 Global admin</span>
            ) : null}
          </div>

          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
            Session: <b>{sessionInfo.email || "—"}</b> ·{" "}
            <span>{shortUuid(sessionInfo.id)}</span>
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

      {/* Sites (optionnel) */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #333", borderRadius: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>Site cible (Admin):</div>

          {isGlobalAdmin && sites.length > 0 ? (
            <>
              <select
                value={targetSiteLabel}
                onChange={(e) => setAdminSite(String(e.target.value || "").trim().toLowerCase())}
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

              <button type="button" onClick={loadMembers} disabled={membersLoading}>
                {membersLoading ? "..." : "Voir membres"}
              </button>

              <button
                type="button"
                onClick={() => setSiteCode?.(targetSiteLabel)}
                disabled={!targetSiteLabel}
                title="Mettre ce site comme site de l’app (Setup/Cockpit)"
              >
                Utiliser dans l’app
              </button>
            </>
          ) : (
            <>
              <span style={{ opacity: 0.8 }}>
                <b>{targetSiteLabel}</b>
              </span>
              <button type="button" onClick={loadSites} disabled={sitesLoading}>
                {sitesLoading ? "..." : "Tester list-sites"}
              </button>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {isGlobalAdmin
                  ? "Aucun site renvoyé."
                  : "Mode mono-site (list-sites indisponible ou non autorisé)."}
              </span>
            </>
          )}
        </div>

        {isGlobalAdmin ? (
          <form onSubmit={createSite} style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Créer un site</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px", gap: 10 }}>
              <input
                value={siteForm.code}
                onChange={(e) => setSiteForm((s) => ({ ...s, code: e.target.value }))}
                placeholder="Code site (ex: melun)"
              />
              <input
                value={siteForm.name}
                onChange={(e) => setSiteForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Nom (optionnel) (ex: Melun)"
              />
              <button type="submit" disabled={siteCreating}>
                {siteCreating ? "..." : "Créer"}
              </button>
            </div>
            <div style={{ opacity: 0.65, fontSize: 12 }}>
              (Si l’endpoint <code>/api/admin/site-create</code> n’existe pas encore, cette partie ne
              marchera pas.)
            </div>
          </form>
        ) : null}
      </div>

      {!canManage && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #444", borderRadius: 8 }}>
          <b>Accès limité.</b> Tu dois être <b>admin</b> (ou global admin) pour créer/assigner/modifier
          des membres.
        </div>
      )}

      <form
        onSubmit={onSubmit}
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #333",
          borderRadius: 10,
          opacity: canManage ? 1 : 0.6,
          pointerEvents: canManage ? "auto" : "none",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Créer / mettre à jour un membre (CODE + PIN)</h3>

        <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 10 }}>
          Site cible: <b>{targetSiteLabel}</b>
          {normalizedSite && targetSiteLabel !== normalizedSite ? (
            <span style={{ marginLeft: 8, opacity: 0.8 }}>
              (⚠️ différent du site de l’app)
            </span>
          ) : null}
        </div>

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
          Site: <b>{targetSiteLabel}</b> · Admins: <b>{adminCount}</b>
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
                      disabled={!canManage || rowBusy}
                      onChange={(e) => updateRole(uid, e.target.value)}
                      title={!canManage ? "Accès admin requis" : ""}
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
                    disabled={!canManage || rowBusy}
                    onClick={() => resetPin(uid, m.member_code)}
                  >
                    {actionLoading[uid] === "pin" ? "..." : "Reset PIN"}
                  </button>

                  <button
                    type="button"
                    disabled={!canManage || rowBusy || uid === sessionInfo.id || isLastAdmin(uid)}
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
