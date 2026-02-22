// src/components/cockpit/CockpitAlerts.jsx
import React from "react";
import { normalizePoste } from "./posteMeta";

export default function CockpitAlerts({
  ui,

  // global state / flags
  canUseTopActions,
  dayStaff,
  currentBlockId,
  blockAssignments,

  // missing assignments
  missingAssignments,
  fillMissingAssignmentsFromPrevBlock,

  // pauses ended
  pausesEndedList,
  pauseDurationMinutes,
  returnAllEndedPausesCurrentBlock,

  // pauses ongoing
  pausesOngoing,
  returnFromPause,

  // pauses due + waves
  pausesDueList,
  pauseAfterMinutes,
  pauseWaveSize,
  setPauseWaveSize,
  pauseSelection,
  togglePausePick,
  selectedPauseList,
  autoPickPauseWave,
  sendPauseWave,

  // rotation notices
  rotationImminent,
  rotationLocked,
  rotationWarnMinutes,
}) {
  return (
    <>
      {missingAssignments.length > 0 && (
        <div className="card callout danger" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ⛔ <b>Postes manquants</b> : {missingAssignments.join(", ")} — complète avant de
              valider la rotation.
            </div>

            {canUseTopActions && (
              <button
                className="btn ghost"
                onClick={() => fillMissingAssignmentsFromPrevBlock()}
                title="Copie le bloc précédent uniquement pour ceux qui n'ont rien"
                style={ui.btnGhost}
                type="button"
              >
                🪄 Remplir automatiquement (copier bloc précédent)
              </button>
            )}
          </div>
        </div>
      )}

      {pausesEndedList.length > 0 && (
        <div className="card callout danger" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ✅ <b>Pause terminée</b> (≥ {pauseDurationMinutes || 30} min) :{" "}
              {pausesEndedList.join(", ")}
            </div>

            {canUseTopActions && (
              <button
                className="btn ghost"
                onClick={() => {
                  const ok = window.confirm(
                    "Retourner au poste précédent tous ceux dont la pause est terminée ?"
                  );
                  if (!ok) return;
                  returnAllEndedPausesCurrentBlock();
                }}
                title="Retour poste précédent (pause terminée)"
                style={ui.btnGhost}
                type="button"
              >
                ↩ Retour poste (tous)
              </button>
            )}
          </div>
        </div>
      )}

      {pausesOngoing.length > 0 && (
        <div className="card callout warn" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              ☕ <b>Pauses en cours</b>
            </div>

            {pausesOngoing.map((x) => (
              <div key={x.nom} className="pill" style={{ gap: 10, ...ui.topStat, borderRadius: 12 }}>
                <span>
                  <b>{x.nom}</b> <span className="muted">({x.leftMin} min)</span>
                </span>

                {canUseTopActions && (
                  <button
                    className="btn ghost mini"
                    style={{
                      ...ui.btnGhost,
                      width: "auto",
                      padding: "8px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    onClick={() => returnFromPause(String(currentBlockId), x.nom)}
                    title="Retour au poste précédent (même bloc)"
                    type="button"
                  >
                    ↩ Retour poste
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pausesDueList.length > 0 && (
        <div className="card callout warn" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ☕ <b>Pauses à prendre</b> : {pausesDueList.join(", ")} (≥ {pauseAfterMinutes} min)
            </div>

            {canUseTopActions && (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="muted">Taille vague</span>
                  <select
                    value={pauseWaveSize || 1}
                    onChange={(e) => setPauseWaveSize(Number(e.target.value))}
                    title="Nombre de personnes max envoyées en pause en même temps"
                    style={{ ...ui.select, width: 90, minWidth: 90, padding: "8px 10px" }}
                  >
                    {Array.from(
                      { length: Math.max(1, Math.min((dayStaff || []).length, 6)) },
                      (_, i) => i + 1
                    ).map((v) => (
                      <option key={v} value={v} style={ui.option}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn ghost"
                  onClick={autoPickPauseWave}
                  style={ui.btnGhost}
                  type="button"
                >
                  🎯 Auto
                </button>

                <button
                  className="btn primary"
                  onClick={sendPauseWave}
                  disabled={selectedPauseList.length === 0}
                  title="Envoie la sélection en pause (dans la limite de la taille de vague)"
                  style={{
                    ...ui.btnPrimary,
                    opacity: selectedPauseList.length > 0 ? 1 : 0.55,
                    cursor: selectedPauseList.length > 0 ? "pointer" : "not-allowed",
                  }}
                  type="button"
                >
                  ☕ Envoyer ({Math.min(selectedPauseList.length, pauseWaveSize || 1)}/
                  {pauseWaveSize || 1})
                </button>
              </>
            )}
          </div>

          {canUseTopActions && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {pausesDueList.map((nom) => (
                <label
                  key={nom}
                  className="pill"
                  style={{
                    cursor: "pointer",
                    userSelect: "none",
                    ...ui.topStat,
                    borderRadius: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!pauseSelection[nom]}
                    onChange={() => togglePausePick(nom)}
                    style={{ marginRight: 8 }}
                  />
                  {nom}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {rotationImminent && !rotationLocked && (
        <div className="card callout warn" style={ui.panel}>
          ⚠️ <b>Rotation imminente</b> : prépare la réaffectation (moins de {rotationWarnMinutes}{" "}
          minutes).
        </div>
      )}

      {rotationLocked && (
        <div className="card callout danger" style={ui.panel}>
          🔄 <b>Rotation obligatoire</b> : réassigne les postes puis clique <b>“Valider rotation”</b>.
        </div>
      )}
    </>
  );
}
