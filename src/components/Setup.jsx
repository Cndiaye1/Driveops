// src/components/Setup.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { supabase } from "../services/supabaseClient";

// ✅ même logique que le store (1er bloc = minutes du 1er horaire, sinon "0")
function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}
function getFirstBlockIdLocal(horaires) {
  const hs = Array.isArray(horaires) ? horaires : [];
  if (hs.length < 2) return "0";
  const startMin = timeToMinutes(hs[0]);
  const endMin = timeToMinutes(hs[hs.length - 1]);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return "0";
  return String(startMin);
}

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
    rotationMinutes, // (gardé: utilisé dans UI/consistance, mais pas nécessaire pour le 1er bloc)
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
  } = useDriveStore();

  const [newPrep, setNewPrep] = useState("");
  const [newCoordo, setNewCoordo] = useState("");

  // ✅ input site: draft + commit (évite setSiteCode à chaque frappe)
  const [siteDraft, setSiteDraft] = useState((siteCode || "").toUpperCase());
  useEffect(() => {
    setSiteDraft((siteCode || "").toUpperCase());
  }, [siteCode]);

  const adminLoading = !!adminState?.loading;
  const role = adminState?.role ?? memberRole ?? null;
  const isAdmin = adminState?.isAdmin ?? (String(role || "").toLowerCase() === "admin");

  const normUpper = (s) => String(s || "").trim().toUpperCase();
  const normLower = (s) => String(s || "").trim().toLowerCase();

  // ✅ Au montage : charge la session remote si besoin
  useEffect(() => {
    ensureSessionLoaded?.();

    // ✅ si quelqu’un arrive sur /admin (ancienne nav), on remet / sans reload
    try {
      if (typeof window !== "undefined") {
        const p = window.location?.pathname || "/";
        if (p.startsWith("/admin")) window.history.replaceState({}, "", "/");
      }
    } catch {}

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isServiceRunning = !!(dayStartedAt || serviceStartedAt);

  const setupBlockId = useMemo(() => getFirstBlockIdLocal(horaires), [horaires]);

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

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
    } finally {
      // remet l’app proprement même si le listener auth tarde
      resetAuthState?.();
      try {
        if (typeof window !== "undefined") window.history.replaceState({}, "", "/");
      } catch {}
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="setupHeader">
          <div>
            <h1>🚗 DriveOps — Configuration de la journée</h1>
            {isServiceRunning ? (
              <p className="muted">✅ Service en cours — tu peux modifier et revenir au cockpit.</p>
            ) : (
              <p className="muted">Étape {setupStep}/2 — Équipe du jour puis placement initial.</p>
            )}
          </div>

          <div className="setupRight" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            {/* ✅ Site code (draft + valider) */}
            <div>
              <label className="muted small">Site code</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={siteDraft}
                  onChange={(e) => setSiteDraft(normUpper(e.target.value))}
                  onBlur={commitSiteCode}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitSiteCode();
                  }}
                  placeholder="MELUN"
                />
                <button className="btn ghost" onClick={commitSiteCode} title="Valider le site">
                  ✔
                </button>
              </div>
              <div className="muted small" style={{ opacity: 0.7, marginTop: 2 }}>
                Stocké en base: <b>{(siteCode || "").toLowerCase() || "—"}</b>
              </div>
            </div>

            <div>
              <label className="muted small">Date</label>
              <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
            </div>

            {/* ✅ bouton Admin */}
            {adminLoading ? (
              <button className="btn ghost" disabled title="Vérification…">
                🛠 Admin…
              </button>
            ) : isAdmin ? (
              <button className="btn ghost" onClick={goAdmin} title="Aller sur la page Admin">
                🛠 Admin
              </button>
            ) : null}

            {/* ✅ cockpit visible si service en cours */}
            {isServiceRunning && (
              <button className="btn ghost" onClick={goCockpit} title="Retour cockpit">
                🧭 Cockpit
              </button>
            )}

            <button className="btn ghost" onClick={handleLogout} title="Se déconnecter">
              🚪 Déconnexion
            </button>

            <div className="muted small" style={{ minWidth: 260 }}>
              API: <b>{apiStatus}</b>
              {apiError ? <span style={{ opacity: 0.85 }}> — {apiError}</span> : null}
              <div style={{ opacity: 0.8, marginTop: 2 }}>
                Rôle site: <b>{role || "—"}</b>
              </div>
            </div>
          </div>
        </div>

        <div className="wizardTabs">
          <button className={`tab ${setupStep === 1 ? "active" : ""}`} onClick={() => setSetupStep(1)}>
            1) Équipe du jour
          </button>

          <button
            className={`tab ${setupStep === 2 ? "active" : ""}`}
            onClick={() => canGoStep2 && setSetupStep(2)}
            disabled={!canGoStep2}
            title={!canGoStep2 ? "Choisis un coordinateur et au moins un préparateur" : ""}
          >
            2) Placement initial
          </button>
        </div>

        {setupStep === 1 && (
          <>
            <div className="section">
              <h2>👤 Coordinateur d’équipe</h2>

              <div className="row">
                <select value={coordinator} onChange={(e) => setCoordinator(e.target.value)}>
                  <option value="">-- Choisir le coordinateur --</option>
                  {coordosList.slice().sort().map((c) => (
                    <option key={c} value={c}>
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
                />
                <button className="btn" onClick={addCoordo}>
                  + Ajouter
                </button>
              </div>

              <div className="listGrid" style={{ marginTop: 10 }}>
                {coordosList.slice().sort().map((c) => (
                  <div key={c} className="listItem">
                    <div className="checkRow">
                      <span className="name">{c}</span>
                    </div>
                    <button className="btn ghost mini" onClick={() => removeCoordoFromList(c)} title="Supprimer">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="section">
              <h2>👥 Préparateurs présents</h2>

              <div className="listGrid">
                {preparateursList.slice().sort().map((p) => {
                  const checked = dayStaff.includes(p);
                  return (
                    <div key={p} className={`listItem ${checked ? "checked" : ""}`}>
                      <label className="checkRow">
                        <input type="checkbox" checked={checked} onChange={() => toggleDayStaff(p)} />
                        <span className="name">{p}</span>
                      </label>

                      <button className="btn ghost mini" onClick={() => removePreparateurFromList(p)} title="Supprimer">
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
                />
                <button className="btn" onClick={addPrep}>
                  + Ajouter
                </button>
              </div>
            </div>

            <div className="section">
              <h2>☕ Pauses (vagues)</h2>
              <p className="muted">Définit le nombre max envoyés en pause en même temps.</p>

              <div className="row">
                <span className="muted" style={{ minWidth: 130 }}>
                  Taille de vague
                </span>
                <select value={pauseWaveSize || 1} onChange={(e) => setPauseWaveSize(Number(e.target.value))}>
                  {Array.from({ length: waveMax }, (_, i) => i + 1).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row">
              <button className="btn ghost" onClick={resetDay}>
                🧹 Reset journée
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn primary" disabled={!canGoStep2} onClick={() => setSetupStep(2)}>
                ➡️ Suivant : Placement initial
              </button>
            </div>
          </>
        )}

        {setupStep === 2 && (
          <>
            <div className="section">
              <h2>📍 Placement initial</h2>
              <p className="muted">
                {isServiceRunning
                  ? "Service en cours : ajuste puis reviens au cockpit."
                  : "Chaque préparateur doit avoir un poste pour démarrer le service."}
              </p>

              <div className="placementGrid">
                {selectedStaff.map((nom) => {
                  const key = normUpper(nom);
                  return (
                    <div key={nom} className="placementRow">
                      <div className="placementName">{nom}</div>
                      <select value={blockAssignments[key] || ""} onChange={(e) => setInitialAssignment(nom, e.target.value)}>
                        <option value="">-- Choisir poste --</option>
                        {postes.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {!isServiceRunning && !allHavePoste && (
                <div className="card callout warn" style={{ marginTop: 12 }}>
                  ⚠️ Tous les préparateurs doivent avoir un poste avant de démarrer.
                </div>
              )}
            </div>

            <div className="row">
              <button className="btn ghost" onClick={() => setSetupStep(1)}>
                ⬅️ Retour
              </button>
              <div style={{ flex: 1 }} />
              {!isServiceRunning && (
                <button className="btn primary" disabled={!canStart} onClick={startService}>
                  ▶️ Démarrer service
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Résumé</h2>
        <div className="muted">
          Site: <b>{(siteCode || "—").toUpperCase()}</b> — Date: <b>{dayDate}</b> — Coordinateur:{" "}
          <b>{coordinator || "—"}</b> — Préparateurs: <b>{dayStaff.length}</b> — Vague pause:{" "}
          <b>{pauseWaveSize || 1}</b>
        </div>
      </div>
    </div>
  );
}
