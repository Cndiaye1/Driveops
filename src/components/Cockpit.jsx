// src/components/Cockpit.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { formatClock, minLeft, minutesSince } from "../utils/time";
import { buildBlocks, formatBlockLabel, toH } from "../utils/blocks";
import { normalizePoste } from "./cockpit/posteMeta";
import CockpitStaffCardsSection from "./cockpit/CockpitStaffCardsSection";

export default function Cockpit() {
  const {
    coordinator,
    dayStaff,
    postes,
    horaires,

    dayStartedAt,
    blockStartedAt,
    serviceStartedAt,

    rotationMinutes,
    rotationWarnMinutes,

    pauseAfterMinutes,
    pauseDurationMinutes,
    pauseTakenAt,

    pauseWaveSize,
    setPauseWaveSize,

    currentBlockId,
    rotationImminent,
    rotationLocked,

    assignments,
    setAssignment,

    stopService,
    validateRotation,
    goSetup,

    wallMode,
    printMode,
    setWallMode,
    enterPrintMode,
    exitPrintMode,

    syncBlocksToSystemClock,
    setSyncBlocksToSystemClock,
    setCurrentBlockManual,

    skipRotation,
    toggleSkipRotation,

    returnFromPause,
    returnAllEndedPausesCurrentBlock,

    returnAlertUntil,

    fillMissingAssignmentsFromPrevBlock,
  } = useDriveStore();

  const [clock, setClock] = useState(formatClock());
  const [menuOpen, setMenuOpen] = useState(false);

  const [pauseSelection, setPauseSelection] = useState({});
  const [onlyPaused, setOnlyPaused] = useState(false);

  // ✅ Modal “forcer bloc”
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState(String(currentBlockId ?? ""));

  // -------------------------------------------------
  // UI styles (safe inline : corrige lisibilité selects/options)
  const ui = {
    select: {
      width: "100%",
      background: "#0f172a",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    option: {
      backgroundColor: "#0f172a",
      color: "#e5e7eb",
    },
    input: {
      width: "100%",
      background: "#0f172a",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    btnGhost: {
      background: "rgba(255,255,255,0.03)",
      color: "#f3f4f6",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 12px",
      cursor: "pointer",
      fontWeight: 600,
    },
    btnPrimary: {
      background: "linear-gradient(180deg, #ef4444, #dc2626)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 8px 18px rgba(220,38,38,0.25)",
    },
    panel: {
      border: "1px solid rgba(255,255,255,0.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
      borderRadius: 14,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    },
    topStat: {
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      borderRadius: 999,
      padding: "8px 12px",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    },
    softRow: {
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.02)",
      borderRadius: 12,
      padding: 10,
    },
  };

  const togglePausePick = useCallback((nom) => {
    setPauseSelection((s) => ({ ...s, [nom]: !s[nom] }));
  }, []);

  const selectedPauseList = useMemo(
    () => Object.keys(pauseSelection).filter((n) => pauseSelection[n]),
    [pauseSelection]
  );

  useEffect(() => {
    const t1 = setInterval(() => setClock(formatClock()), 1000);
    return () => clearInterval(t1);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("wall", !!wallMode);
  }, [wallMode]);

  useEffect(() => {
    document.body.classList.toggle("print", !!printMode);
  }, [printMode]);

  useEffect(() => {
    document.body.classList.toggle("modalOpen", !!blockModalOpen);
  }, [blockModalOpen]);

  useEffect(() => {
    const onAfterPrint = () => exitPrintMode();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [exitPrintMode]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setBlockModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const blocks = useMemo(
    () => buildBlocks(horaires || [], rotationMinutes),
    [horaires, rotationMinutes]
  );

  const currentBlock = useMemo(() => {
    return blocks.find((b) => b.id === String(currentBlockId)) || null;
  }, [blocks, currentBlockId]);

  const blockLabel = useMemo(() => {
    if (currentBlock) return formatBlockLabel(currentBlock);
    return String(currentBlockId ?? "");
  }, [currentBlock, currentBlockId]);

  const remaining = useMemo(() => {
    const base = blockStartedAt || serviceStartedAt;
    return minLeft(base, rotationMinutes);
  }, [blockStartedAt, serviceStartedAt, rotationMinutes, clock]);

  const blockAssignments = assignments?.[String(currentBlockId)] || {};

  // ✅ Postes manquants sur bloc courant (bloque la validation)
  const missingAssignments = useMemo(() => {
    return (dayStaff || []).filter((nom) => !normalizePoste(blockAssignments[nom]));
  }, [dayStaff, blockAssignments]);

  const canValidateRotation = rotationLocked && missingAssignments.length === 0;

  const elapsedMin = useMemo(() => {
    const start = dayStartedAt || serviceStartedAt;
    return minutesSince(start) ?? 0;
  }, [dayStartedAt, serviceStartedAt, clock]);

  function isPauseDue(nom) {
    const start = dayStartedAt || serviceStartedAt;
    if (!start) return false;
    const taken = pauseTakenAt?.[nom];
    if (taken) return false;
    return elapsedMin >= pauseAfterMinutes;
  }

  const pausesDueList = useMemo(
    () => (dayStaff || []).filter(isPauseDue),
    [dayStaff, elapsedMin, pauseTakenAt, dayStartedAt, serviceStartedAt, pauseAfterMinutes]
  );

  // ✅ pauses en cours
  const pausesOngoing = useMemo(() => {
    const durMs = (Number(pauseDurationMinutes) || 30) * 60000;
    const now = Date.now();

    const list = [];
    (dayStaff || []).forEach((nom) => {
      const isInPause = normalizePoste(blockAssignments[nom]) === "PAUSE";
      const started = pauseTakenAt?.[nom];
      if (!isInPause || !started) return;

      const elapsed = now - started;
      const leftMin = Math.ceil((durMs - elapsed) / 60000);
      if (leftMin > 0) list.push({ nom, leftMin });
    });

    list.sort((a, b) => a.leftMin - b.leftMin);
    return list;
  }, [dayStaff, blockAssignments, pauseTakenAt, pauseDurationMinutes, clock]);

  // ✅ pauses terminées
  const pausesEndedList = useMemo(() => {
    const durMs = (Number(pauseDurationMinutes) || 30) * 60000;
    const now = Date.now();

    return (dayStaff || []).filter((nom) => {
      const isInPause = normalizePoste(blockAssignments[nom]) === "PAUSE";
      const started = pauseTakenAt?.[nom];
      if (!isInPause || !started) return false;
      return now - started >= durMs;
    });
  }, [dayStaff, blockAssignments, pauseTakenAt, pauseDurationMinutes, clock]);

  const stats = useMemo(() => {
    const total = (dayStaff || []).length;
    let assignedNow = 0;
    let pauseNow = 0;
    let emptyNow = 0;

    (dayStaff || []).forEach((nom) => {
      const p = normalizePoste(blockAssignments[nom]);
      if (!p) emptyNow++;
      else if (p === "PAUSE") pauseNow++;
      else assignedNow++;
    });

    return { total, assignedNow, pauseNow, emptyNow };
  }, [dayStaff, blockAssignments]);

  const phaseLabel = rotationLocked
    ? "Rotation obligatoire"
    : rotationImminent
    ? `Rotation imminente (${rotationWarnMinutes} min)`
    : "En cours";

  const exportWall = useCallback(() => {
    enterPrintMode();
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 50);
    });
  }, [enterPrintMode]);

  const canUseTopActions = !wallMode && !printMode;
  const canEdit = !wallMode && !printMode;

  const autoPickPauseWave = useCallback(() => {
    const due = pausesDueList.filter((n) => normalizePoste(blockAssignments[n]) !== "PAUSE");
    const pick = due.slice(0, Math.max(1, pauseWaveSize || 1));
    const next = {};
    pick.forEach((n) => (next[n] = true));
    setPauseSelection(next);
  }, [pausesDueList, blockAssignments, pauseWaveSize]);

  const sendPauseWave = useCallback(() => {
    const wave = selectedPauseList.slice(0, Math.max(1, pauseWaveSize || 1));
    wave.forEach((nom) => setAssignment(String(currentBlockId), nom, "PAUSE"));
    setPauseSelection({});
  }, [selectedPauseList, pauseWaveSize, setAssignment, currentBlockId]);

  // ✅ Modal bloc
  const openBlockModal = useCallback(() => {
    setBlockDraft(String(currentBlockId ?? ""));
    setMenuOpen(false);
    setBlockModalOpen(true);
  }, [currentBlockId]);

  const applyBlockModal = useCallback(() => {
    const bid = String(blockDraft ?? "");
    const ok = window.confirm(
      "Forcer ce bloc manuellement ?\n\n⚠️ Cela désactive la sync sur l’heure du PC."
    );
    if (!ok) return;

    setCurrentBlockManual(bid);
    setBlockModalOpen(false);
  }, [blockDraft, setCurrentBlockManual]);

  const canReturnFromPause = (nom) => normalizePoste(blockAssignments[nom]) === "PAUSE";

  const visibleStaff = useMemo(() => {
    if (!onlyPaused) return dayStaff || [];
    return (dayStaff || []).filter((n) => normalizePoste(blockAssignments[n]) === "PAUSE");
  }, [onlyPaused, dayStaff, blockAssignments]);

  const currentSkipMap = skipRotation?.[String(currentBlockId)] || {};
  const showSkipUI = rotationImminent || rotationLocked;

  const phaseTone = rotationLocked ? "#fca5a5" : rotationImminent ? "#fcd34d" : "#86efac";

  return (
    <div className="page" onClick={() => menuOpen && setMenuOpen(false)}>
      {/* ✅ MODAL “FORCER BLOC” */}
      {blockModalOpen && (
        <div className="modalOverlay" onClick={() => setBlockModalOpen(false)}>
          <div className="modalCard card" onClick={(e) => e.stopPropagation()} style={ui.panel}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0 }}>⏱️ Forcer un bloc</h2>
              <button
                className="btn ghost"
                onClick={() => setBlockModalOpen(false)}
                title="Fermer"
                style={ui.btnGhost}
                type="button"
              >
                ✕
              </button>
            </div>

            <p className="muted" style={{ marginTop: 8 }}>
              Choisis le bloc à afficher. Cela désactive la <b>sync sur l’heure du PC</b>.
            </p>

            <div className="row" style={{ marginTop: 10 }}>
              <select
                value={blockDraft}
                onChange={(e) => setBlockDraft(e.target.value)}
                style={ui.select}
              >
                {blocks.map((b) => (
                  <option key={b.id} value={b.id} style={ui.option}>
                    {toH(b.start)}–{toH(b.end)}
                  </option>
                ))}
              </select>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn ghost"
                onClick={() => setBlockModalOpen(false)}
                style={ui.btnGhost}
                type="button"
              >
                Annuler
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn primary"
                onClick={applyBlockModal}
                style={ui.btnPrimary}
                type="button"
              >
                ✅ Valider
              </button>
            </div>

            <div className="muted small" style={{ marginTop: 10, opacity: 0.75 }}>
              Astuce : recoche “Sync sur l’heure du PC” dans Options pour revenir en automatique.
            </div>
          </div>
        </div>
      )}

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

      {/* ✅ Postes manquants : BLOQUE la rotation + bouton auto-fill */}
      {missingAssignments.length > 0 && (
        <div className="card callout danger" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ⛔ <b>Postes manquants</b> : {missingAssignments.join(", ")} — complète avant de
              valider la rotation.
            </div>

            {canUseTopActions && (
              <button
                className="btn ghost"
                onClick={() => fillMissingAssignmentsFromPrevBlock()}
                title="Copie le bloc précédent uniquement pour ceux qui n'ont rien"
                style={ui.btnGhost}
                type="button"
              >
                🪄 Remplir automatiquement (copier bloc précédent)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ✅ Pause terminée */}
      {pausesEndedList.length > 0 && (
        <div className="card callout danger" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ✅ <b>Pause terminée</b> (≥ {pauseDurationMinutes || 30} min) :{" "}
              {pausesEndedList.join(", ")}
            </div>

            {canUseTopActions && (
              <button
                className="btn ghost"
                onClick={() => {
                  const ok = window.confirm(
                    "Retourner au poste précédent tous ceux dont la pause est terminée ?"
                  );
                  if (!ok) return;
                  returnAllEndedPausesCurrentBlock();
                }}
                title="Retour poste précédent (pause terminée)"
                style={ui.btnGhost}
                type="button"
              >
                ↩ Retour poste (tous)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ✅ Pauses en cours (timer restant) */}
      {pausesOngoing.length > 0 && (
        <div className="card callout warn" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              ☕ <b>Pauses en cours</b>
            </div>

            {pausesOngoing.map((x) => (
              <div key={x.nom} className="pill" style={{ gap: 10, ...ui.topStat, borderRadius: 12 }}>
                <span>
                  <b>{x.nom}</b> <span className="muted">({x.leftMin} min)</span>
                </span>

                {canUseTopActions && (
                  <button
                    className="btn ghost mini"
                    style={{
                      ...ui.btnGhost,
                      width: "auto",
                      padding: "8px 10px",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    onClick={() => returnFromPause(String(currentBlockId), x.nom)}
                    title="Retour au poste précédent (même bloc)"
                    type="button"
                  >
                    ↩ Retour poste
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pauses (vagues) */}
      {pausesDueList.length > 0 && (
        <div className="card callout warn" onClick={(e) => e.stopPropagation()} style={ui.panel}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ☕ <b>Pauses à prendre</b> : {pausesDueList.join(", ")} (≥ {pauseAfterMinutes} min)
            </div>

            {canUseTopActions && (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="muted">Taille vague</span>
                  <select
                    value={pauseWaveSize || 1}
                    onChange={(e) => setPauseWaveSize(Number(e.target.value))}
                    title="Nombre de personnes max envoyées en pause en même temps"
                    style={{ ...ui.select, width: 90, minWidth: 90, padding: "8px 10px" }}
                  >
                    {Array.from(
                      { length: Math.max(1, Math.min((dayStaff || []).length, 6)) },
                      (_, i) => i + 1
                    ).map((v) => (
                      <option key={v} value={v} style={ui.option}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn ghost"
                  onClick={autoPickPauseWave}
                  style={ui.btnGhost}
                  type="button"
                >
                  🎯 Auto
                </button>

                <button
                  className="btn primary"
                  onClick={sendPauseWave}
                  disabled={selectedPauseList.length === 0}
                  title="Envoie la sélection en pause (dans la limite de la taille de vague)"
                  style={{
                    ...ui.btnPrimary,
                    opacity: selectedPauseList.length > 0 ? 1 : 0.55,
                    cursor: selectedPauseList.length > 0 ? "pointer" : "not-allowed",
                  }}
                  type="button"
                >
                  ☕ Envoyer ({Math.min(selectedPauseList.length, pauseWaveSize || 1)}/
                  {pauseWaveSize || 1})
                </button>
              </>
            )}
          </div>

          {canUseTopActions && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {pausesDueList.map((nom) => (
                <label
                  key={nom}
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
                    checked={!!pauseSelection[nom]}
                    onChange={() => togglePausePick(nom)}
                    style={{ marginRight: 8 }}
                  />
                  {nom}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {rotationImminent && !rotationLocked && (
        <div className="card callout warn" style={ui.panel}>
          ⚠️ <b>Rotation imminente</b> : prépare la réaffectation (moins de {rotationWarnMinutes}{" "}
          minutes).
        </div>
      )}

      {rotationLocked && (
        <div className="card callout danger" style={ui.panel}>
          🔄 <b>Rotation obligatoire</b> : réassigne les postes puis clique <b>“Valider rotation”</b>.
        </div>
      )}

      {/* ✅ Section extraite */}
      <CockpitStaffCardsSection
        ui={ui}
        blockLabel={blockLabel}
        rotationMinutes={rotationMinutes}
        rotationWarnMinutes={rotationWarnMinutes}
        wallMode={wallMode}
        onlyPaused={onlyPaused}
        setOnlyPaused={setOnlyPaused}
        showSkipUI={showSkipUI}
        visibleStaff={visibleStaff}
        currentBlockId={currentBlockId}
        blockAssignments={blockAssignments}
        postes={postes}
        canEdit={canEdit}
        pauseTakenAt={pauseTakenAt}
        pauseDurationMinutes={pauseDurationMinutes}
        returnAlertUntil={returnAlertUntil}
        currentSkipMap={currentSkipMap}
        rotationLocked={rotationLocked}
        rotationImminent={rotationImminent}
        isPauseDue={isPauseDue}
        canReturnFromPause={canReturnFromPause}
        setAssignment={setAssignment}
        returnFromPause={returnFromPause}
        toggleSkipRotation={toggleSkipRotation}
      />
    </div>
  );
}
