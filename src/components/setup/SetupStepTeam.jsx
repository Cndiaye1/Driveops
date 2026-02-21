import React from "react";

export default function SetupStepTeam({
  ui,
  coordinator,
  setCoordinator,
  coordosList = [],
  newCoordo,
  setNewCoordo,
  addCoordo,
  removeCoordoFromList,

  preparateursList = [],
  dayStaff = [],
  toggleDayStaff,
  newPrep,
  setNewPrep,
  addPrep,
  removePreparateurFromList,

  pauseWaveSize,
  setPauseWaveSize,
  waveMax,

  resetDay,
  canGoStep2,
  setSetupStep,
}) {
  const inputStyle = ui.input;
  const selectStyle = ui.select;
  const optionStyle = ui.option;

  return (
    <>
      <div className="section" style={ui.section}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0 }}>👤 Coordinateur d’équipe</h2>
          <span style={ui.smallPill}>
            Liste: <b>{coordosList.length}</b>
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
            Sélectionnés: <b>{dayStaff.length}</b> / {preparateursList.length}
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
                  background: checked ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)",
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
  );
}
