// src/components/cockpit/CockpitStaffGrid.jsx
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
  wallMode,
  visibleStaff,
  cardProps,
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
          <CockpitStaffCard key={nom} nom={nom} ui={ui} {...cardProps} />
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
