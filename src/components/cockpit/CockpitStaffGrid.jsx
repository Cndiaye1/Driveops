import React from "react";
import CockpitStaffCard from "./CockpitStaffCard";

export default function CockpitStaffGrid({
  ui,
  blockLabel,
  rotationMinutes,
  rotationWarnMinutes,

  onlyPaused,
  setOnlyPaused,
  showSkipUI,

  visibleStaff = [],
  blockAssignments = {},
  pauseTakenAt = {},
  pauseDurationMinutes,
  returnAlertUntil = {},
  currentSkipMap = {},

  rotationLocked,
  rotationImminent,
  isPauseDue,
  normalizePoste,
  posteMeta,

  canEdit,
  setAssignment,
  currentBlockId,
  postes = [],
  toggleSkipRotation,
  returnFromPause,

  wallMode,
}) {
  const now = Date.now();
  const durMs = (Number(pauseDurationMinutes) || 30) * 60000;

  return (
    <div className="card" style={ui.panel}>
      <div className="sectionHeader">
        <h2>Cartes préparateurs (bloc en cours : {blockLabel})</h2>
        <p className="muted">
          0 → {rotationMinutes - rotationWarnMinutes} min : Poste •{" "}
          {rotationMinutes - rotationWarnMinutes} → {rotationMinutes} : Imminente • ≥{" "}
          {rotationMinutes} : Rotation obligatoire
        </p>

        <div className="row noPrint" style={{ marginTop: 10 }}>
          <label
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
              checked={onlyPaused}
              onChange={(e) => setOnlyPaused(e.target.checked)}
            />
            <span style={{ marginLeft: 8 }}>Voir seulement ceux en pause</span>
          </label>

          {showSkipUI && (
            <span className="muted small">
              Skip rotation = <b>garde le poste</b> sur ce passage.
            </span>
          )}
        </div>
      </div>

      <div className="cardsGrid">
        {visibleStaff.map((nom) => {
          const poste = normalizePoste(blockAssignments[nom]);
          const meta = posteMeta(poste);
          const pauseDue = isPauseDue(nom);

          const started = pauseTakenAt?.[nom];
          const pauseEnded = poste === "PAUSE" && started && now - started >= durMs;

          const justReturned = (returnAlertUntil?.[nom] || 0) > now;
          const isSkipped = !!currentSkipMap?.[nom];

          const canReturn = normalizePoste(blockAssignments[nom]) === "PAUSE";

          return (
            <CockpitStaffCard
              key={nom}
              ui={ui}
              nom={nom}
              blockAssignments={blockAssignments}
              currentBlockId={currentBlockId}
              postes={postes}
              setAssignment={setAssignment}
              canEdit={canEdit}
              canReturn={canReturn}
              returnFromPause={returnFromPause}
              showSkipUI={showSkipUI}
              isSkipped={isSkipped}
              toggleSkipRotation={toggleSkipRotation}
              poste={poste}
              meta={meta}
              pauseDue={pauseDue}
              pauseEnded={pauseEnded}
              justReturned={justReturned}
              rotationLocked={rotationLocked}
              rotationImminent={rotationImminent}
            />
          );
        })}
      </div>

      {!wallMode && (
        <div className="miniNote muted noPrint">
          Astuce : en urgence tu peux changer un poste à tout moment.
        </div>
      )}
    </div>
  );
}
