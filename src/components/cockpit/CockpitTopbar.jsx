// src/components/cockpit/CockpitTopbar.jsx
import React from "react";
import CockpitOptionsMenu from "./CockpitOptionsMenu";

export default function CockpitTopbar({
  ui,
  coordinator,
  clock,
  blockLabel,
  phaseTone,
  phaseLabel,
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
