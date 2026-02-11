import React, { useMemo, useState } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { getFirstBlockId } from "../utils/blocks";

export default function Setup() {
  const {
    // ✅ API
    siteCode,
    setSiteCode,
    apiStatus,
    apiError,
    hydrateFromApi,

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
    resetAll,

    serviceStartedAt,
    dayStartedAt,
  } = useDriveStore();

  const [newPrep, setNewPrep] = useState("");
  const [newCoordo, setNewCoordo] = useState("");

  const isServiceRunning = !!(dayStartedAt || serviceStartedAt);

  const setupBlockId = useMemo(
    () => getFirstBlockId(horaires || [], rotationMinutes),
    [horaires, rotationMinutes]
  );

  // si service en cours, on bosse sur le bloc en cours, sinon premier bloc
  const effectiveBlockId = isServiceRunning ? String(currentBlockId ?? "") : setupBlockId;

  const blockAssignments = assignments?.[effectiveBlockId] || {};
  const selectedStaff = useMemo(() => (dayStaff || []).slice().sort(), [dayStaff]);

  const hasCoordinator = String(coordinator || "").trim() !== "";
  const hasStaff = (dayStaff || []).length > 0;

  const allHavePoste = selectedStaff.every((nom) => blockAssignments[nom] && blockAssignments[nom] !== "");

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

  const waveMax = useMemo(() => Math.max(1, Math.min((dayStaff?.length || 1), 6)), [dayStaff]);

  return (
    <div className="page">
      <div className="card">
        <div className="setupHeader">
          <div>
            <h1>🚗 DriveOps — Configuration de la journée</h1>

            {isServiceRunning ? (
              <p className="muted">✅ Service en cours — tu peux modifier et revenir au cockpit sans relancer le timer.</p>
            ) : (
              <p className="muted">Étape {setupStep}/2 — Équipe du jour puis placement initial.</p>
            )}
          </div>

          {/* ✅ Site + date + sync */}
          <div className="setupRight" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label className="muted small">Site code</label>
              <input value={siteCode || ""} onChange={(e) => setSiteCode(e.target.value)} placeholder="MELUN" />
            </div>

            <div>
              <label className="muted small">Date</label>
              <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
            </div>

            <button className="btn ghost" onClick={hydrateFromApi} title="Recharge remote (remote écrase local)">
              🔄 Sync
            </button>

            {apiStatus !== "idle" && (
              <div className="muted small" style={{ minWidth: 200 }}>
                API: <b>{apiStatus}</b>
                {apiError ? <span style={{ opacity: 0.8 }}> — {apiError}</span> : null}
              </div>
            )}
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
            title="Choisis un coordinateur et au moins un préparateur"
          >
            2) Placement initial
          </button>

          {isServiceRunning && (
            <button className="tab cta" onClick={goCockpit} title="Retourner au cockpit (sans relancer le service)">
              🧭 Cockpit
            </button>
          )}
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

              {/* ✅ gestion liste coordos */}
              <div className="listGrid" style={{ marginTop: 10 }}>
                {coordosList.slice().sort().map((c) => (
                  <div key={c} className="listItem">
                    <div className="checkRow">
                      <span className="name">{c}</span>
                    </div>
                    <button className="btn ghost mini" onClick={() => removeCoordoFromList(c)} title="Supprimer du référentiel">
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

                      <button
                        className="btn ghost mini"
                        onClick={() => removePreparateurFromList(p)}
                        title="Supprimer du référentiel"
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
                />
                <button className="btn" onClick={addPrep}>
                  + Ajouter
                </button>
              </div>
            </div>

            <div className="section">
              <h2>☕ Pauses (vagues)</h2>
              <p className="muted">
                Définit le nombre de personnes max envoyées en pause en même temps. (Modifiable aussi dans le cockpit si besoin terrain.)
              </p>

              <div className="row">
                <span className="muted" style={{ minWidth: 130 }}>
                  Taille de vague
                </span>
                <select
                  value={pauseWaveSize || 1}
                  onChange={(e) => setPauseWaveSize(Number(e.target.value))}
                  title="Nombre max en pause simultanément"
                >
                  {Array.from({ length: waveMax }, (_, i) => i + 1).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row">
              <button className="btn ghost" onClick={resetAll}>
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
                  ? "Service en cours : ajuste si besoin (sur le bloc en cours) puis reviens au cockpit."
                  : "Chaque préparateur doit avoir un poste pour démarrer le service."}
              </p>

              <div className="muted small" style={{ marginBottom: 10 }}>
                Bloc utilisé : <b>{isServiceRunning ? "bloc en cours" : "premier bloc"}</b>
              </div>

              <div className="placementGrid">
                {selectedStaff.map((nom) => (
                  <div key={nom} className="placementRow">
                    <div className="placementName">{nom}</div>
                    <select value={blockAssignments[nom] || ""} onChange={(e) => setInitialAssignment(nom, e.target.value)}>
                      <option value="">-- Choisir poste --</option>
                      {postes.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
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
          Site: <b>{siteCode || "—"}</b> — Date: <b>{dayDate}</b> — Coordinateur: <b>{coordinator || "—"}</b> — Préparateurs:{" "}
          <b>{dayStaff.length}</b> — Vague pause: <b>{pauseWaveSize || 1}</b>
        </div>
      </div>
    </div>
  );
}
