import React from "react";

export default function SetupStepPlacement({
  ui,
  selectedStaff,
  effectiveBlockId,
  isServiceRunning,
  blockAssignments,
  postes,
  setInitialAssignment,
  normUpper,
  allHavePoste,
  canStart,
  setSetupStep,
  startService,
}) {
  const selectStyle = ui.select;
  const optionStyle = ui.option;

  return (
    <>
      <div className="section" style={ui.section}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
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
          {(selectedStaff || []).map((nom) => {
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
                  {(postes || []).map((p) => (
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
  );
}
