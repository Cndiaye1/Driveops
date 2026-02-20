// src/components/Cockpit.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { formatClock, minLeft, minutesSince } from "../utils/time";
import { buildBlocks, formatBlockLabel, toH } from "../utils/blocks";

// ✅ Table d'icônes alignée sur les postes du store
const POSTE_META = {
  
ACCUEIL: { icon: "🛎️", label: "ACCUEIL" },
PGC: { icon: "📦", label: "PGC" },
  FS: { icon: "🏷️", label: "FS" },
  LIV: { icon: "🚚", label: "LIV" },
  MES: { icon: "📥", label: "MES" }, // Mise en stock
  LAD: { icon: "🏠", label: "LAD" }, // Livraison à domicile
  "FLEG/SURG": { icon: "🥬🧊", label: "FLEG/SURG" },
  RE: { icon: "♻️", label: "RE" }, // Réceptions / retours (selon ton usage)
  NET: { icon: "🧽", label: "NET" }, // Nettoyage
  PAUSE: { icon: "☕", label: "PAUSE" },
};

function normalizePoste(p) {
  return (p || "").trim().toUpperCase();
}

// ✅ gère aussi les cas "FLEG" / "SURG" -> "FLEG/SURG" si jamais ça circule
function posteMeta(poste) {
  const key = normalizePoste(poste);
  if (!key) return { icon: "📍", label: "" };

  if (POSTE_META[key]) return POSTE_META[key];

  // tolérance : si on reçoit "FLEG" ou "SURG"
  if (key === "FLEG" || key === "SURG") return POSTE_META["FLEG/SURG"];

  return { icon: "📍", label: key };
}

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

  // ✅ IMPORTANT: tick() met à jour rotationImminent/rotationLocked dans le store
  const tick = useDriveStore((s) => s.tick);

  const [clock, setClock] = useState(formatClock());
  const [menuOpen, setMenuOpen] = useState(false);

  const [pauseSelection, setPauseSelection] = useState({});
  const [onlyPaused, setOnlyPaused] = useState(false);

  // ✅ Modal “forcer bloc”
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState(String(currentBlockId ?? ""));

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

  // ✅ FAIT TOURNER LE TICK STORE (sinon plus d’alerte rotation)
  useEffect(() => {
    try {
      tick?.(); // 1er calcul immédiat
    } catch {}

    const id = setInterval(() => {
      try {
        tick?.();
      } catch {}
    }, 10_000); // 10s = suffisant et léger (mets 5_000 si tu veux plus réactif)

    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    document.body.classList.toggle("wall", !!wallMode);
  }, [wallMode]);

  useEffect(() => {
    document.body.classList.toggle("print", !!printMode);
  }, [printMode]);

  // ✅ scroll lock body quand modal ouverte
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

  const blocks = useMemo(() => buildBlocks(horaires || [], rotationMinutes), [horaires, rotationMinutes]);

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
    const ok = window.confirm("Forcer ce bloc manuellement ?\n\n⚠️ Cela désactive la sync sur l’heure du PC.");
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

  return (
    <div className="page" onClick={() => menuOpen && setMenuOpen(false)}>
      {/* ✅ MODAL “FORCER BLOC” */}
      {blockModalOpen && (
        <div className="modalOverlay" onClick={() => setBlockModalOpen(false)}>
          <div className="modalCard card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>⏱️ Forcer un bloc</h2>
              <button className="btn ghost" onClick={() => setBlockModalOpen(false)} title="Fermer">
                ✕
              </button>
            </div>

            <p className="muted" style={{ marginTop: 8 }}>
              Choisis le bloc à afficher. Cela désactive la <b>sync sur l’heure du PC</b>.
            </p>

            <div className="row" style={{ marginTop: 10 }}>
              <select value={blockDraft} onChange={(e) => setBlockDraft(e.target.value)}>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {toH(b.start)}–{toH(b.end)}
                  </option>
                ))}
              </select>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => setBlockModalOpen(false)}>
                Annuler
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn primary" onClick={applyBlockModal}>
                ✅ Valider
              </button>
            </div>

            <div className="muted small" style={{ marginTop: 10, opacity: 0.75 }}>
              Astuce : recoche “Sync sur l’heure du PC” dans Options pour revenir en automatique.
            </div>
          </div>
        </div>
      )}

      <div className="topbar card">
        <div className="topbarLeft">
          <h1>🧭 Cockpit Drive</h1>
          <div className="muted">
            Coordinateur : <b>{coordinator || "—"}</b>
          </div>
          <div className="muted">
            Horloge: <b>{clock}</b>
          </div>

          <div className="muted">
            Bloc: <b>{blockLabel}</b>
            <span className="dot">•</span>
            Phase: <b>{phaseLabel}</b>
            <span className="dot">•</span>
            Rotation: <b>{rotationLocked ? "À FAIRE" : `${remaining ?? "--"} min`}</b>
          </div>

          <div className="muted small">
            Pause obligatoire après <b>{pauseAfterMinutes} min</b> — Durée pause : <b>{pauseDurationMinutes || 30} min</b>
          </div>
        </div>

        <div className="topbarRight">
          <div className="pillRow">
            <div className="pill">
              👥 Total <b>{stats.total}</b>
            </div>
            <div className="pill">
              ✅ Assignés <b>{stats.assignedNow}</b>
            </div>
            <div className="pill">
              ☕ Pause <b>{stats.pauseNow}</b>
            </div>
            <div className="pill">
              ⬜ Vides <b>{stats.emptyNow}</b>
            </div>
          </div>

          {canUseTopActions && (
            <div className="actions noPrint" onClick={(e) => e.stopPropagation()}>
              <button className="btn ghost" onClick={() => setWallMode(true)}>
                🧱 Mode Mur
              </button>

              <button className="btn ghost" onClick={exportWall} title="Imprimer / Enregistrer en PDF">
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
                >
                  ⋯ Options
                </button>

                {menuOpen && (
                  <div
                    className="card"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 8px)",
                      width: 260,
                      padding: 12,
                      zIndex: 9999,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="btn ghost"
                      style={{ width: "100%", marginBottom: 8 }}
                      onClick={() => {
                        setMenuOpen(false);
                        goSetup();
                      }}
                    >
                      ⚙️ Setup
                    </button>

                    <button
                      className="btn ghost"
                      style={{ width: "100%", marginBottom: 10 }}
                      onClick={() => {
                        setMenuOpen(false);
                        stopService();
                      }}
                    >
                      ⏹️ Stop service
                    </button>

                    <div style={{ height: 1, background: "rgba(255,255,255,0.12)", margin: "10px 0" }} />

                    <div className="muted small" style={{ marginBottom: 6 }}>
                      ⏱️ Gestion des blocs
                    </div>

                    <label className="pill" style={{ cursor: "pointer", userSelect: "none", width: "100%" }}>
                      <input
                        type="checkbox"
                        checked={!!syncBlocksToSystemClock}
                        onChange={(e) => setSyncBlocksToSystemClock(e.target.checked)}
                      />
                      <span style={{ marginLeft: 8 }}>Sync sur l’heure du PC</span>
                    </label>

                    <button
                      className="btn ghost"
                      style={{ width: "100%", marginTop: 10 }}
                      onClick={openBlockModal}
                      title="Choisir un bloc manuellement (désactive la sync)"
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
              <button className="btn ghost" onClick={() => setWallMode(false)}>
                ⬅️ Quitter Mode Mur
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Postes manquants : BLOQUE la rotation + bouton auto-fill */}
      {missingAssignments.length > 0 && (
        <div className="card callout danger" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ⛔ <b>Postes manquants</b> : {missingAssignments.join(", ")} — complète avant de valider la rotation.
            </div>

            {canUseTopActions && (
              <button
                className="btn ghost"
                onClick={() => fillMissingAssignmentsFromPrevBlock()}
                title="Copie le bloc précédent uniquement pour ceux qui n'ont rien"
              >
                🪄 Remplir automatiquement (copier bloc précédent)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ✅ Pause terminée */}
      {pausesEndedList.length > 0 && (
        <div className="card callout danger" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              ✅ <b>Pause terminée</b> (≥ {pauseDurationMinutes || 30} min) : {pausesEndedList.join(", ")}
            </div>

            {canUseTopActions && (
              <button
                className="btn ghost"
                onClick={() => {
                  const ok = window.confirm("Retourner au poste précédent tous ceux dont la pause est terminée ?");
                  if (!ok) return;
                  returnAllEndedPausesCurrentBlock();
                }}
                title="Retour poste précédent (pause terminée)"
              >
                ↩ Retour poste (tous)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ✅ Pauses en cours (timer restant) */}
      {pausesOngoing.length > 0 && (
        <div className="card callout warn" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              ☕ <b>Pauses en cours</b>
            </div>

            {pausesOngoing.map((x) => (
              <div key={x.nom} className="pill" style={{ gap: 10 }}>
                <span>
                  <b>{x.nom}</b> <span className="muted">({x.leftMin} min)</span>
                </span>

                {canUseTopActions && (
                  <button
                    className="btn ghost mini"
                    style={{ width: "auto", padding: "8px 10px" }}
                    onClick={() => returnFromPause(String(currentBlockId), x.nom)}
                    title="Retour au poste précédent (même bloc)"
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
        <div className="card callout warn" onClick={(e) => e.stopPropagation()}>
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
                  >
                    {Array.from({ length: Math.max(1, Math.min((dayStaff || []).length, 6)) }, (_, i) => i + 1).map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <button className="btn ghost" onClick={autoPickPauseWave}>
                  🎯 Auto
                </button>

                <button
                  className="btn primary"
                  onClick={sendPauseWave}
                  disabled={selectedPauseList.length === 0}
                  title="Envoie la sélection en pause (dans la limite de la taille de vague)"
                >
                  ☕ Envoyer ({Math.min(selectedPauseList.length, pauseWaveSize || 1)}/{pauseWaveSize || 1})
                </button>
              </>
            )}
          </div>

          {canUseTopActions && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {pausesDueList.map((nom) => (
                <label key={nom} className="pill" style={{ cursor: "pointer", userSelect: "none" }}>
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
        <div className="card callout warn">
          ⚠️ <b>Rotation imminente</b> : prépare la réaffectation (moins de {rotationWarnMinutes} minutes).
        </div>
      )}

      {rotationLocked && (
        <div className="card callout danger">
          🔄 <b>Rotation obligatoire</b> : réassigne les postes puis clique <b>“Valider rotation”</b>.
        </div>
      )}

      <div className="card">
        <div className="sectionHeader">
          <h2>Cartes préparateurs (bloc en cours : {blockLabel})</h2>
          <p className="muted">
            0 → {rotationMinutes - rotationWarnMinutes} min : Poste •{" "}
            {rotationMinutes - rotationWarnMinutes} → {rotationMinutes} : Imminente • ≥ {rotationMinutes} : Rotation
            obligatoire
          </p>

          <div className="row noPrint" style={{ marginTop: 10 }}>
            <label className="pill" style={{ cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={onlyPaused} onChange={(e) => setOnlyPaused(e.target.checked)} />
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
          {visibleStaff.map((nom) => {
            const poste = normalizePoste(blockAssignments[nom]);
            const meta = posteMeta(poste);
            const pauseDue = isPauseDue(nom);

            const started = pauseTakenAt?.[nom];
            const durMs = (Number(pauseDurationMinutes) || 30) * 60000;
            const pauseEnded = poste === "PAUSE" && started && Date.now() - started >= durMs;

            const justReturned = (returnAlertUntil?.[nom] || 0) > Date.now();
            const isSkipped = !!currentSkipMap?.[nom];

            const cardState = rotationLocked ? "danger" : pauseDue || rotationImminent ? "warn" : poste && poste !== "PAUSE" ? "info" : "idle";

            return (
              <div key={nom} className={`cardItem ${cardState}`}>
                <div className="cardTop">
                  <div className="cardName">{nom}</div>

                  {poste ? (
                    <div className="cardPoste">
                      <span className="posteIcon">{meta.icon}</span>
                      <span className="posteLabel">{meta.label}</span>
                    </div>
                  ) : (
                    <div className="cardPoste muted">—</div>
                  )}
                </div>

                <div className="cardMid">
                  {pauseDue && (
                    <div className="cardAlert">
                      <span className="badge warn">☕ Pause à prendre</span>
                    </div>
                  )}

                  {pauseEnded && (
                    <div className="cardAlert">
                      <span className="badge danger">✅ Pause terminée</span>
                    </div>
                  )}

                  {justReturned && (
                    <div className="cardAlert">
                      <span className="badge info">↩ Retour</span>
                    </div>
                  )}

                  {showSkipUI && isSkipped && poste && poste !== "PAUSE" && (
                    <div className="cardAlert">
                      <span className="badge info">⏭️ Skip rotation</span>
                    </div>
                  )}

                  {!pauseDue && rotationLocked && poste && poste !== "PAUSE" && !isSkipped && (
                    <div className="cardAlert">
                      <span className="badge danger">🔄 ROTATION</span>
                    </div>
                  )}

                  {!pauseDue && !rotationLocked && rotationImminent && poste && poste !== "PAUSE" && !isSkipped && (
                    <div className="cardAlert">
                      <span className="badge warn">⚠️ Rotation imminente</span>
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="cardBottom noPrint">
                    <div className="cardBottomRow" style={{ alignItems: "center" }}>
                      <select
                        value={blockAssignments[nom] || ""}
                        onChange={(e) => setAssignment(String(currentBlockId), nom, e.target.value)}
                        title="Changer de poste (urgence possible)"
                      >
                        <option value="">--</option>
                        {(postes || []).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>

                      {canReturnFromPause(nom) ? (
                        <button
                          className="btn mini"
                          onClick={() => returnFromPause(String(currentBlockId), nom)}
                          title="Retour au poste précédent (même bloc)"
                        >
                          ↩
                        </button>
                      ) : (
                        <button
                          className="btn mini"
                          onClick={() => setAssignment(String(currentBlockId), nom, "PAUSE")}
                          title="Mettre directement en PAUSE"
                        >
                          ☕
                        </button>
                      )}
                    </div>

                    {/* ✅ Skip rotation */}
                    {showSkipUI && poste && poste !== "PAUSE" && (
                      <label className="skipRow" style={{ marginTop: 10, cursor: "pointer", userSelect: "none" }}>
                        <input
                          type="checkbox"
                          checked={!!isSkipped}
                          onChange={() => toggleSkipRotation(String(currentBlockId), nom)}
                        />
                        <span style={{ marginLeft: 10 }}>⏭️ Skip rotation (garde son poste)</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!wallMode && <div className="miniNote muted noPrint">Astuce : en urgence tu peux changer un poste à tout moment.</div>}
      </div>
    </div>
  );
}
