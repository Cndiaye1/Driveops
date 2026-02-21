// src/components/cockpit/CockpitTopbar.jsx
import React from "react";

function CockpitOptionsMenu({
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

export default function CockpitTopbar({
  ui,
  coordinator,
  clock,
  blockLabel,
  phaseLabel,
  phaseTone,
  rotationLocked,
  remaining,
  pauseAfterMinutes,
  pauseDurationMinutes,
  stats,
  canUseTopActions,
  wallMode,
  printMode,
  setWallMode,
  exportWall,
  validateRotation,
  canValidateRotation,
  missingAssignments,
  menuOpen,
  setMenuOpen,
  goSetup,
  stopService,
  syncBlocksToSystemClock,
  setSyncBlocksToSystemClock,
  openBlockModal,
}) {
  return (
    <div className="topbar card" style={ui.panel}>
      <div className="topbarLeft">
        <h1 style={{ marginBottom: 8 }}>🧭 Cockpit Drive</h1>

        <div className="muted" style={{ marginBottom: 4 }}>
          Coordinateur : <b>{coordinator || "—"}</b>
        </div>

        <div className="muted" style={{ marginBottom: 4 }}>
          Horloge: <b>{clock}</b>
        </div>

        <div
          className="muted"
          style={{
            marginBottom: 6,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          Bloc: <b>{blockLabel}</b>
          <span className="dot">•</span>
          Phase: <b style={{ color: phaseTone }}>{phaseLabel}</b>
          <span className="dot">•</span>
          Rotation: <b>{rotationLocked ? "À FAIRE" : `${remaining ?? "--"} min`}</b>
        </div>

        <div className="muted small">
          Pause obligatoire après <b>{pauseAfterMinutes} min</b> — Durée pause :{" "}
          <b>{pauseDurationMinutes || 30} min</b>
        </div>
      </div>

      <div className="topbarRight">
        <div className="pillRow" style={{ gap: 8 }}>
          <div className="pill" style={ui.topStat}>
            👥 Total <b>{stats.total}</b>
          </div>
          <div className="pill" style={ui.topStat}>
            ✅ Assignés <b>{stats.assignedNow}</b>
          </div>
          <div className="pill" style={ui.topStat}>
            ☕ Pause <b>{stats.pauseNow}</b>
          </div>
          <div className="pill" style={ui.topStat}>
            ⬜ Vides <b>{stats.emptyNow}</b>
          </div>
        </div>

        {canUseTopActions && (
          <div className="actions noPrint" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn ghost"
              onClick={() => setWallMode(true)}
              style={ui.btnGhost}
              type="button"
            >
              🧱 Mode Mur
            </button>

            <button
              className="btn ghost"
              onClick={exportWall}
              title="Imprimer / Enregistrer en PDF"
              style={ui.btnGhost}
              type="button"
            >
              📄 Export Mur
            </button>

            {rotationLocked && (
              <button
                className="btn primary"
                onClick={validateRotation}
                disabled={!canValidateRotation}
                title={
                  canValidateRotation
                    ? "Valider la rotation et passer au bloc suivant"
                    : `Impossible : postes manquants (${missingAssignments.length})`
                }
                style={{
                  ...ui.btnPrimary,
                  opacity: canValidateRotation ? 1 : 0.55,
                  cursor: canValidateRotation ? "pointer" : "not-allowed",
                }}
                type="button"
              >
                ✅ Valider rotation
              </button>
            )}

            <CockpitOptionsMenu
              ui={ui}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
              goSetup={goSetup}
              stopService={stopService}
              syncBlocksToSystemClock={syncBlocksToSystemClock}
              setSyncBlocksToSystemClock={setSyncBlocksToSystemClock}
              openBlockModal={openBlockModal}
            />
          </div>
        )}

        {wallMode && !printMode && (
          <div className="actions noPrint">
            <button
              className="btn ghost"
              onClick={() => setWallMode(false)}
              style={ui.btnGhost}
              type="button"
            >
              ⬅️ Quitter Mode Mur
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
