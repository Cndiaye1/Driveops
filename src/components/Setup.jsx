import React, { useEffect, useMemo, useState } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { getFirstBlockId } from "../utils/blocks";
import { supabase } from "../services/supabaseClient";

export default function Setup({ adminState } = {}) {
  const {
    siteCode,
    setSiteCode,

    apiStatus,
    apiError,
    ensureSessionLoaded,

    setupStep,
    setSetupStep,

    dayDate,
    setDayDate,

    coordinator,
    setCoordinator,

    preparateursList,
    coordosList,
    dayStaff,
    toggleDayStaff,

    postes,
    horaires,
    rotationMinutes,
    currentBlockId,
    assignments,
    setInitialAssignment,

    addPreparateurToList,
    removePreparateurFromList,
    addCoordoToList,
    removeCoordoFromList,

    pauseWaveSize,
    setPauseWaveSize,

    startService,
    goCockpit,
    goAdmin,
    resetDay,

    serviceStartedAt,
    dayStartedAt,

    memberRole,
    resetAuthState,

    // optionnel si dispo dans store (status config site)
    cfgStatus,
    cfgError,
  } = useDriveStore();

  const [newPrep, setNewPrep] = useState("");
  const [newCoordo, setNewCoordo] = useState("");

  // ✅ input site: draft + commit
  const [siteDraft, setSiteDraft] = useState((siteCode || "").toUpperCase());
  useEffect(() => {
    setSiteDraft((siteCode || "").toUpperCase());
  }, [siteCode]);

  const adminLoading = !!adminState?.loading;
  const role = adminState?.role ?? memberRole ?? null;
  const isAdmin = adminState?.isAdmin ?? (String(role || "").toLowerCase() === "admin");

  const normUpper = (s) => String(s || "").trim().toUpperCase();
  const normLower = (s) => String(s || "").trim().toLowerCase();

  // ✅ Au montage : charge la session (remote) si besoin
  useEffect(() => {
    ensureSessionLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isServiceRunning = !!(dayStartedAt || serviceStartedAt);

  const setupBlockId = useMemo(
    () => getFirstBlockId(horaires || [], rotationMinutes),
    [horaires, rotationMinutes]
  );

  const effectiveBlockId = useMemo(() => {
    if (!isServiceRunning) return setupBlockId;
    const id = String(currentBlockId ?? "").trim();
    return id ? id : setupBlockId;
  }, [isServiceRunning, currentBlockId, setupBlockId]);

  const blockAssignments = assignments?.[effectiveBlockId] || {};
  const selectedStaff = useMemo(() => (dayStaff || []).slice().sort(), [dayStaff]);

  const hasCoordinator = normUpper(coordinator) !== "";
  const hasStaff = (dayStaff || []).length > 0;

  const allHavePoste = selectedStaff.every((nom) => {
    const key = normUpper(nom);
    return blockAssignments[key] && blockAssignments[key] !== "";
  });

  const canGoStep2 = hasCoordinator && hasStaff;
  const canStart = hasCoordinator && hasStaff && allHavePoste;

  function addPrep() {
    const v = newPrep.trim();
    if (!v) return;
    addPreparateurToList(v);
    setNewPrep("");
  }

  function addCoordo() {
    const v = newCoordo.trim();
    if (!v) return;
    addCoordoToList(v);
    setNewCoordo("");
  }

  const waveMax = useMemo(() => Math.max(1, Math.min(dayStaff?.length || 1, 6)), [dayStaff]);

  async function commitSiteCode() {
    const next = normLower(siteDraft);
    const cur = normLower(siteCode);
    if (!next) return;
    if (next === cur) return;

    try {
      await setSiteCode(next); // async (hydrate remote)
    } catch (e) {
      console.error("[setSiteCode]", e);
    }
  }

  // ✅ NAV helpers : important sur Vercel si tu es sur /admin (URL) mais app en screen-based
  function pushUrl(pathname) {
    try {
      if (typeof window !== "undefined" && window.location.pathname !== pathname) {
        window.history.pushState({}, "", pathname);
      }
    } catch {}
  }

  function goToAdmin() {
    goAdmin?.();
    pushUrl("/admin");
  }

  function goToCockpitSafe() {
    goCockpit?.();
    pushUrl("/");
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
    } finally {
      resetAuthState?.();
      try {
        window.location.assign("/");
      } catch {}
    }
  }

  // -------------------------------------------------
  // UI styles (safe inline pour corriger lisibilité)
  const ui = {
    surface: {
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    },
    section: {
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 14,
    },
    label: {
      fontSize: 12,
      opacity: 0.78,
      marginBottom: 4,
      display: "block",
      fontWeight: 600,
      letterSpacing: "0.2px",
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
      background: "linear-gradient(180deg, #ef4444, #dc2626)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 8px 18px rgba(220,38,38,0.25)",
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
    smallPill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      fontSize: 12,
      opacity: 0.95,
    },
    summaryCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
    },
  };

  const inputStyle = ui.input;
  const selectStyle = ui.select;
  const optionStyle = ui.option;

  const apiBadgeColor =
    apiStatus === "error"
      ? "#fca5a5"
      : apiStatus === "offline"
      ? "#fcd34d"
      : apiStatus === "pushed" || apiStatus === "pulled"
      ? "#86efac"
      : "#cbd5e1";

  return (
    <div className="page">
      <div className="card" style={ui.surface}>
        <div className="setupHeader">
          <div>
            <h1 style={{ marginBottom: 6 }}>🚗 DriveOps — Configuration de la journée</h1>
            {isServiceRunning ? (
              <p className="muted" style={{ marginTop: 0 }}>
                ✅ Service en cours — tu peux modifier puis revenir au cockpit.
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Étape {setupStep}/2 — Équipe du jour puis placement initial.
              </p>
            )}
          </div>

          <div
            className="setupRight"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "end",
              flexWrap: "wrap",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 10,
            }}
          >
            {/* ✅ Site code (draft + valider) */}
            <div>
              <label className="muted small" style={ui.label}>
                Site code
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={siteDraft}
                  onChange={(e) => setSiteDraft(normUpper(e.target.value))}
                  onBlur={commitSiteCode}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitSiteCode();
                  }}
                  placeholder="MELUN"
                  style={{ ...inputStyle, minWidth: 120 }}
                />
                <button
                  className="btn ghost"
                  onClick={commitSiteCode}
                  title="Valider le site"
                  style={ui.btnGhost}
                  type="button"
                >
                  ✔
                </button>
              </div>
              <div className="muted small" style={{ opacity: 0.7, marginTop: 6 }}>
                Stocké en base: <b>{(siteCode || "").toLowerCase() || "—"}</b>
              </div>
            </div>

            <div>
              <label className="muted small" style={ui.label}>
                Date
              </label>
              <input
                type="date"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* ✅ bouton Admin */}
            {adminLoading ? (
              <button className="btn ghost" disabled title="Vérification…" style={ui.btnGhost}>
                🛠 Admin…
              </button>
            ) : isAdmin ? (
              <button
                className="btn ghost"
                onClick={goToAdmin}
                title="Aller sur la page Admin"
                style={ui.btnGhost}
                type="button"
              >
                🛠 Admin
              </button>
            ) : null}

            {/* ✅ cockpit visible si service en cours */}
            {isServiceRunning && (
              <button
                className="btn ghost"
                onClick={goToCockpitSafe}
                title="Retour cockpit"
                style={ui.btnGhost}
                type="button"
              >
                🧭 Cockpit
              </button>
            )}

            <button
              className="btn ghost"
              onClick={handleLogout}
              title="Se déconnecter"
              style={ui.btnGhost}
              type="button"
            >
              🚪 Déconnexion
            </button>

            <div
              className="muted small"
              style={{
                minWidth: 260,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.12)",
              }}
            >
              <div>
                API: <b style={{ color: apiBadgeColor }}>{apiStatus}</b>
                {apiError ? <span style={{ opacity: 0.9 }}> — {apiError}</span> : null}
              </div>

              {"cfgStatus" in useDriveStore.getState?.() ? (
                <div style={{ marginTop: 2, opacity: 0.92 }}>
                  Config site: <b>{cfgStatus || "—"}</b>
                  {cfgError ? <span style={{ opacity: 0.9 }}> — {cfgError}</span> : null}
                </div>
              ) : null}

              <div style={{ opacity: 0.85, marginTop: 2 }}>
                Rôle site: <b>{role || "—"}</b>
              </div>
            </div>
          </div>
        </div>

        <div
          className="wizardTabs"
          style={{
            marginTop: 10,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            padding: 6,
            borderRadius: 12,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button
            className={`tab ${setupStep === 1 ? "active" : ""}`}
            onClick={() => setSetupStep(1)}
            type="button"
            style={{
              ...ui.btnGhost,
              borderColor: setupStep === 1 ? "rgba(239,68,68,0.55)" : ui.btnGhost.border,
              background:
                setupStep === 1 ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)",
            }}
          >
            1) Équipe du jour
          </button>

          <button
            className={`tab ${setupStep === 2 ? "active" : ""}`}
            onClick={() => canGoStep2 && setSetupStep(2)}
            disabled={!canGoStep2}
            title={!canGoStep2 ? "Choisis un coordinateur et au moins un préparateur" : ""}
            type="button"
            style={{
              ...ui.btnGhost,
              opacity: canGoStep2 ? 1 : 0.5,
              cursor: canGoStep2 ? "pointer" : "not-allowed",
              borderColor: setupStep === 2 ? "rgba(239,68,68,0.55)" : ui.btnGhost.border,
              background:
                setupStep === 2 ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)",
            }}
          >
            2) Placement initial
          </button>
        </div>

        {setupStep === 1 && (
          <>
            <div className="section" style={ui.section}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>👤 Coordinateur d’équipe</h2>
                <span style={ui.smallPill}>
                  Liste: <b>{(coordosList || []).length}</b>
                </span>
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <select
                  value={coordinator}
                  onChange={(e) => setCoordinator(e.target.value)}
                  style={selectStyle}
                >
                  <option value="" style={optionStyle}>
                    -- Choisir le coordinateur --
                  </option>
                  {coordosList.slice().sort().map((c) => (
                    <option key={c} value={c} style={optionStyle}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="row">
                <input
                  value={newCoordo}
                  onChange={(e) => setNewCoordo(e.target.value)}
                  placeholder="Ajouter coordinateur (ex: AMINE)"
                  style={inputStyle}
                />
                <button className="btn" onClick={addCoordo} type="button" style={ui.btn}>
                  + Ajouter
                </button>
              </div>

              <div className="listGrid" style={{ marginTop: 10 }}>
                {coordosList.slice().sort().map((c) => (
                  <div
                    key={c}
                    className="listItem"
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div className="checkRow">
                      <span className="name">{c}</span>
                    </div>
                    <button
                      className="btn ghost mini"
                      onClick={() => removeCoordoFromList(c)}
                      title="Supprimer"
                      type="button"
                      style={{
                        ...ui.btnGhost,
                        padding: "6px 9px",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="section" style={ui.section}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>👥 Préparateurs présents</h2>
                <span style={ui.smallPill}>
                  Sélectionnés: <b>{(dayStaff || []).length}</b> / {(preparateursList || []).length}
                </span>
              </div>

              <div className="listGrid" style={{ marginTop: 10 }}>
                {preparateursList.slice().sort().map((p) => {
                  const checked = dayStaff.includes(p);
                  return (
                    <div
                      key={p}
                      className={`listItem ${checked ? "checked" : ""}`}
                      style={{
                        border: checked
                          ? "1px solid rgba(239,68,68,0.35)"
                          : "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 10,
                        background: checked
                          ? "rgba(239,68,68,0.08)"
                          : "rgba(255,255,255,0.02)",
                      }}
                    >
                      <label className="checkRow" style={{ cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleDayStaff(p)} />
                        <span className="name">{p}</span>
                      </label>

                      <button
                        className="btn ghost mini"
                        onClick={() => removePreparateurFromList(p)}
                        title="Supprimer"
                        type="button"
                        style={{
                          ...ui.btnGhost,
                          padding: "6px 9px",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="row">
                <input
                  value={newPrep}
                  onChange={(e) => setNewPrep(e.target.value)}
                  placeholder="Ajouter préparateur (ex: SARAH)"
                  style={inputStyle}
                />
                <button className="btn" onClick={addPrep} type="button" style={ui.btn}>
                  + Ajouter
                </button>
              </div>
            </div>

            <div className="section" style={ui.section}>
              <h2 style={{ marginTop: 0 }}>☕ Pauses (vagues)</h2>
              <p className="muted">Définit le nombre max envoyés en pause en même temps.</p>

              <div
                className="row"
                style={{
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <span className="muted" style={{ minWidth: 130 }}>
                  Taille de vague
                </span>
                <select
                  value={pauseWaveSize || 1}
                  onChange={(e) => setPauseWaveSize(Number(e.target.value))}
                  style={{ ...selectStyle, maxWidth: 120 }}
                >
                  {Array.from({ length: waveMax }, (_, i) => i + 1).map((v) => (
                    <option key={v} value={v} style={optionStyle}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row">
              <button className="btn ghost" onClick={resetDay} type="button" style={ui.btnGhost}>
                🧹 Reset journée
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn primary"
                disabled={!canGoStep2}
                onClick={() => setSetupStep(2)}
                type="button"
                style={{
                  ...ui.btnPrimary,
                  opacity: canGoStep2 ? 1 : 0.5,
                  cursor: canGoStep2 ? "pointer" : "not-allowed",
                }}
              >
                ➡️ Suivant : Placement initial
              </button>
            </div>
          </>
        )}

        {setupStep === 2 && (
          <>
            <div className="section" style={ui.section}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>📍 Placement initial</h2>
                <span style={ui.smallPill}>
                  Bloc: <b>{effectiveBlockId}</b>
                </span>
              </div>

              <p className="muted" style={{ marginTop: 8 }}>
                {isServiceRunning
                  ? "Service en cours : ajuste puis reviens au cockpit."
                  : "Chaque préparateur doit avoir un poste pour démarrer le service."}
              </p>

              <div className="placementGrid">
                {selectedStaff.map((nom) => {
                  const key = normUpper(nom);
                  return (
                    <div
                      key={nom}
                      className="placementRow"
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.02)",
                        padding: 10,
                      }}
                    >
                      <div className="placementName" style={{ fontWeight: 700 }}>
                        {nom}
                      </div>
                      <select
                        value={blockAssignments[key] || ""}
                        onChange={(e) => setInitialAssignment(nom, e.target.value)}
                        style={selectStyle}
                      >
                        <option value="" style={optionStyle}>
                          -- Choisir poste --
                        </option>
                        {postes.map((p) => (
                          <option key={p} value={p} style={optionStyle}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {!isServiceRunning && !allHavePoste && (
                <div
                  className="card callout warn"
                  style={{
                    marginTop: 12,
                    border: "1px solid rgba(245,158,11,0.35)",
                    background: "rgba(245,158,11,0.08)",
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  ⚠️ Tous les préparateurs doivent avoir un poste avant de démarrer.
                </div>
              )}
            </div>

            <div className="row">
              <button
                className="btn ghost"
                onClick={() => setSetupStep(1)}
                type="button"
                style={ui.btnGhost}
              >
                ⬅️ Retour
              </button>
              <div style={{ flex: 1 }} />
              {!isServiceRunning && (
                <button
                  className="btn primary"
                  disabled={!canStart}
                  onClick={startService}
                  type="button"
                  style={{
                    ...ui.btnPrimary,
                    opacity: canStart ? 1 : 0.5,
                    cursor: canStart ? "pointer" : "not-allowed",
                  }}
                >
                  ▶️ Démarrer service
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card" style={ui.summaryCard}>
        <h2 style={{ marginTop: 0 }}>Résumé</h2>

        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <div style={ui.smallPill}>
            🏪 Site: <b>{(siteCode || "—").toUpperCase()}</b>
          </div>
          <div style={ui.smallPill}>
            📅 Date: <b>{dayDate}</b>
          </div>
          <div style={ui.smallPill}>
            👤 Coordinateur: <b>{coordinator || "—"}</b>
          </div>
          <div style={ui.smallPill}>
            👥 Préparateurs: <b>{dayStaff.length}</b>
          </div>
          <div style={ui.smallPill}>
            ☕ Vague pause: <b>{pauseWaveSize || 1}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
