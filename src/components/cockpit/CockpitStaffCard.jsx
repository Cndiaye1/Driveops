// src/components/cockpit/CockpitStaffCard.jsx
import React from "react";
import { normalizePoste, posteMeta } from "./cockpitUi";

export default function CockpitStaffCard({
  nom,
  ui,
  canEdit,
  postes,
  currentBlockId,
  blockAssignments,
  setAssignment,
  pauseTakenAt,
  pauseDurationMinutes,
  returnAlertUntil,
  canReturnFromPause,
  returnFromPause,
  showSkipUI,
  currentSkipMap,
  toggleSkipRotation,
  isPauseDue,
  rotationImminent,
  rotationLocked,
}) {
  const poste = normalizePoste(blockAssignments[nom]);
  const meta = posteMeta(poste);
  const pauseDue = isPauseDue(nom);

  const started = pauseTakenAt?.[nom];
  const durMs = (Number(pauseDurationMinutes) || 30) * 60000;
  const pauseEnded = poste === "PAUSE" && started && Date.now() - started >= durMs;

  const justReturned = (returnAlertUntil?.[nom] || 0) > Date.now();
  const isSkipped = !!currentSkipMap?.[nom];

  const cardState = rotationLocked
    ? "danger"
    : pauseDue || rotationImminent
    ? "warn"
    : poste && poste !== "PAUSE"
    ? "info"
    : "idle";

  return (
    <div
      className={`cardItem ${cardState}`}
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.02)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
      }}
    >
      <div className="cardTop">
        <div className="cardName">{nom}</div>

        {poste ? (
          <div className="cardPoste">
            <span className="posteIcon">{meta.icon}</span>
            <span className="posteLabel">{meta.label}</span>
          </div>
        ) : (
          <div className="cardPoste muted">—</div>
        )}
      </div>

      <div className="cardMid">
        {pauseDue && (
          <div className="cardAlert">
            <span className="badge warn">☕ Pause à prendre</span>
          </div>
        )}

        {pauseEnded && (
          <div className="cardAlert">
            <span className="badge danger">✅ Pause terminée</span>
          </div>
        )}

        {justReturned && (
          <div className="cardAlert">
            <span className="badge info">↩ Retour</span>
          </div>
        )}

        {showSkipUI && isSkipped && poste && poste !== "PAUSE" && (
          <div className="cardAlert">
            <span className="badge info">⏭️ Skip rotation</span>
          </div>
        )}

        {!pauseDue && rotationLocked && poste && poste !== "PAUSE" && !isSkipped && (
          <div className="cardAlert">
            <span className="badge danger">🔄 ROTATION</span>
          </div>
        )}

        {!pauseDue &&
          !rotationLocked &&
          rotationImminent &&
          poste &&
          poste !== "PAUSE" &&
          !isSkipped && (
            <div className="cardAlert">
              <span className="badge warn">⚠️ Rotation imminente</span>
            </div>
          )}
      </div>

      {canEdit && (
        <div className="cardBottom noPrint">
          <div className="cardBottomRow" style={{ alignItems: "center" }}>
            <select
              value={blockAssignments[nom] || ""}
              onChange={(e) => setAssignment(String(currentBlockId), nom, e.target.value)}
              title="Changer de poste (urgence possible)"
              style={{ ...ui.select, padding: "8px 10px" }}
            >
              <option value="" style={ui.option}>
                --
              </option>
              {(postes || []).map((p) => (
                <option key={p} value={p} style={ui.option}>
                  {p}
                </option>
              ))}
            </select>

            {canReturnFromPause(nom) ? (
              <button
                className="btn mini"
                onClick={() => returnFromPause(String(currentBlockId), nom)}
                title="Retour au poste précédent (même bloc)"
                style={{
                  ...ui.btnGhost,
                  padding: "8px 10px",
                  borderRadius: 8,
                  width: "auto",
                }}
                type="button"
              >
                ↩
              </button>
            ) : (
              <button
                className="btn mini"
                onClick={() => setAssignment(String(currentBlockId), nom, "PAUSE")}
                title="Mettre directement en PAUSE"
                style={{
                  ...ui.btnGhost,
                  padding: "8px 10px",
                  borderRadius: 8,
                  width: "auto",
                }}
                type="button"
              >
                ☕
              </button>
            )}
          </div>

          {showSkipUI && poste && poste !== "PAUSE" && (
            <label
              className="skipRow"
              style={{
                marginTop: 10,
                cursor: "pointer",
                userSelect: "none",
                display: "flex",
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <input
                type="checkbox"
                checked={!!isSkipped}
                onChange={() => toggleSkipRotation(String(currentBlockId), nom)}
              />
              <span style={{ marginLeft: 10 }}>⏭️ Skip rotation (garde son poste)</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
