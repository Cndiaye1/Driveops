// src/components/Cockpit.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { formatClock, minLeft, minutesSince } from "../utils/time";
import { buildBlocks, formatBlockLabel } from "../utils/blocks";

import CockpitTopbar from "./cockpit/CockpitTopbar";
import CockpitBlockModal from "./cockpit/CockpitBlockModal";
import CockpitCallouts from "./cockpit/CockpitCallouts";
import CockpitStaffGrid from "./cockpit/CockpitStaffGrid";
import { getCockpitUi, normalizePoste } from "./cockpit/cockpitUi";

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

  const ui = useMemo(() => getCockpitUi(), []);

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

  const handleReturnAllEndedPauses = useCallback(() => {
    const ok = window.confirm("Retourner au poste précédent tous ceux dont la pause est terminée ?");
    if (!ok) return;
    returnAllEndedPausesCurrentBlock();
  }, [returnAllEndedPausesCurrentBlock]);

  const cardProps = useMemo(
    () => ({
      canEdit,
      postes,
      currentBlockId,
      blockAssignments,
      setAssignment,
      pauseTakenAt,
      pauseDurationMinutes,
      returnAlertUntil,
      canReturnFromPause,
      returnFromPause,
      showSkipUI,
      currentSkipMap,
      toggleSkipRotation,
      isPauseDue,
      rotationImminent,
      rotationLocked,
    }),
    [
      canEdit,
      postes,
      currentBlockId,
      blockAssignments,
      setAssignment,
      pauseTakenAt,
      pauseDurationMinutes,
      returnAlertUntil,
      returnFromPause,
      showSkipUI,
      currentSkipMap,
      toggleSkipRotation,
      rotationImminent,
      rotationLocked,
      // canReturnFromPause + isPauseDue are stable enough as inline closures in component lifecycle
    ]
  );

  return (
    <div className="page" onClick={() => menuOpen && setMenuOpen(false)}>
      <CockpitBlockModal
        open={blockModalOpen}
        blocks={blocks}
        blockDraft={blockDraft}
        setBlockDraft={setBlockDraft}
        onClose={() => setBlockModalOpen(false)}
        onApply={applyBlockModal}
        ui={ui}
      />

      <CockpitTopbar
        ui={ui}
        coordinator={coordinator}
        clock={clock}
        blockLabel={blockLabel}
        phaseLabel={phaseLabel}
        phaseTone={phaseTone}
        rotationLocked={rotationLocked}
        remaining={remaining}
        pauseAfterMinutes={pauseAfterMinutes}
        pauseDurationMinutes={pauseDurationMinutes}
        stats={stats}
        canUseTopActions={canUseTopActions}
        wallMode={wallMode}
        printMode={printMode}
        setWallMode={setWallMode}
        exportWall={exportWall}
        validateRotation={validateRotation}
        canValidateRotation={canValidateRotation}
        missingAssignments={missingAssignments}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        goSetup={goSetup}
        stopService={stopService}
        syncBlocksToSystemClock={syncBlocksToSystemClock}
        setSyncBlocksToSystemClock={setSyncBlocksToSystemClock}
        openBlockModal={openBlockModal}
      />

      <CockpitCallouts
        ui={ui}
        canUseTopActions={canUseTopActions}
        missingAssignments={missingAssignments}
        onAutoFillMissing={() => fillMissingAssignmentsFromPrevBlock()}
        pausesEndedList={pausesEndedList}
        pauseDurationMinutes={pauseDurationMinutes}
        onReturnAllEndedPauses={handleReturnAllEndedPauses}
        pausesOngoing={pausesOngoing}
        currentBlockId={currentBlockId}
        onReturnFromPause={returnFromPause}
        pausesDueList={pausesDueList}
        pauseAfterMinutes={pauseAfterMinutes}
        pauseWaveSize={pauseWaveSize}
        setPauseWaveSize={setPauseWaveSize}
        dayStaffLength={(dayStaff || []).length}
        autoPickPauseWave={autoPickPauseWave}
        sendPauseWave={sendPauseWave}
        selectedPauseList={selectedPauseList}
        pauseSelection={pauseSelection}
        togglePausePick={togglePausePick}
        blockAssignments={blockAssignments}
        rotationImminent={rotationImminent}
        rotationLocked={rotationLocked}
        rotationWarnMinutes={rotationWarnMinutes}
      />

      <CockpitStaffGrid
        ui={ui}
        blockLabel={blockLabel}
        rotationMinutes={rotationMinutes}
        rotationWarnMinutes={rotationWarnMinutes}
        onlyPaused={onlyPaused}
        setOnlyPaused={setOnlyPaused}
        showSkipUI={showSkipUI}
        wallMode={wallMode}
        visibleStaff={visibleStaff}
        cardProps={cardProps}
      />
    </div>
  );
}
