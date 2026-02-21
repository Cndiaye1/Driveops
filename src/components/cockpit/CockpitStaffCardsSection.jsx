// src/components/cockpit/CockpitStaffCardsSection.jsx
import React from "react";
import { normalizePoste } from "./posteMeta";
import CockpitStaffCard from "./CockpitStaffCard";

export default function CockpitStaffCardsSection({
  ui,
  blockLabel,
  rotationMinutes,
  rotationWarnMinutes,
  wallMode,
  onlyPaused,
  setOnlyPaused,
  showSkipUI,
  visibleStaff,

  // props carte
  currentBlockId,
  blockAssignments,
  postes,
  canEdit,
  pauseTakenAt,
  pauseDurationMinutes,
  returnAlertUntil,
  currentSkipMap,
  rotationLocked,
  rotationImminent,
  isPauseDue,
  canReturnFromPause,
  setAssignment,
  returnFromPause,
  toggleSkipRotation,
}) {
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
        {visibleStaff.map((nom) => (
          <CockpitStaffCard
            key={nom}
            nom={nom}
            currentBlockId={currentBlockId}
            blockAssignments={blockAssignments}
            postes={postes}
            ui={ui}
            canEdit={canEdit}
            pauseTakenAt={pauseTakenAt}
            pauseDurationMinutes={pauseDurationMinutes}
            returnAlertUntil={returnAlertUntil}
            currentSkipMap={currentSkipMap}
            showSkipUI={showSkipUI}
            rotationLocked={rotationLocked}
            rotationImminent={rotationImminent}
            isPauseDue={isPauseDue}
            canReturnFromPause={canReturnFromPause}
            setAssignment={setAssignment}
            returnFromPause={returnFromPause}
            toggleSkipRotation={toggleSkipRotation}
          />
        ))}
      </div>

      {!wallMode && (
        <div className="miniNote muted noPrint">
          Astuce : en urgence tu peux changer un poste à tout moment.
        </div>
      )}
    </div>
  );
}
