// src/components/cockpit/CockpitOptionsMenu.jsx
import React from "react";

export default function CockpitOptionsMenu({
  ui,
  menuOpen,
  setMenuOpen,
  goSetup,
  stopService,
  syncBlocksToSystemClock,
  setSyncBlocksToSystemClock,
  openBlockModal,
}) {
  return (
    <div style={{ position: "relative", overflow: "visible" }}>
      <button
        className="btn ghost"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        title="Options"
        style={ui.btnGhost}
        type="button"
      >
        ⋯ Options
      </button>

      {menuOpen && (
        <div
          className="card"
          style={{
            ...ui.panel,
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 280,
            padding: 12,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn ghost"
            style={{ ...ui.btnGhost, width: "100%", marginBottom: 8 }}
            onClick={() => {
              setMenuOpen(false);
              goSetup();
            }}
            type="button"
          >
            ⚙️ Setup
          </button>

          <button
            className="btn ghost"
            style={{ ...ui.btnGhost, width: "100%", marginBottom: 10 }}
            onClick={() => {
              setMenuOpen(false);
              stopService();
            }}
            type="button"
          >
            ⏹️ Stop service
          </button>

          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,0.12)",
              margin: "10px 0",
            }}
          />

          <div className="muted small" style={{ marginBottom: 6 }}>
            ⏱️ Gestion des blocs
          </div>

          <label
            className="pill"
            style={{
              cursor: "pointer",
              userSelect: "none",
              width: "100%",
              ...ui.softRow,
              display: "flex",
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={!!syncBlocksToSystemClock}
              onChange={(e) => setSyncBlocksToSystemClock(e.target.checked)}
            />
            <span style={{ marginLeft: 8 }}>Sync sur l’heure du PC</span>
          </label>

          <button
            className="btn ghost"
            style={{ ...ui.btnGhost, width: "100%", marginTop: 10 }}
            onClick={openBlockModal}
            title="Choisir un bloc manuellement (désactive la sync)"
            type="button"
          >
            🧩 Forcer un bloc…
          </button>

          <div className="muted small" style={{ marginTop: 10, opacity: 0.7 }}>
            Astuce : coche “Sync” pour revenir en automatique.
          </div>
        </div>
      )}
    </div>
  );
}
