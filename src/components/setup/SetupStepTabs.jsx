import React from "react";

export default function SetupStepTabs({ ui, setupStep, setSetupStep, canGoStep2 }) {
  return (
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
          background: setupStep === 1 ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)",
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
          background: setupStep === 2 ? "rgba(239,68,68,0.14)" : "rgba(255,255,255,0.03)",
        }}
      >
        2) Placement initial
      </button>
    </div>
  );
}
