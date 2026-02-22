// src/components/Setup.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { getFirstBlockId } from "../utils/blocks";
import { supabase } from "../services/supabaseClient";

import SetupHeader from "./setup/SetupHeader";
import SetupStepTabs from "./setup/SetupStepTabs";
import SetupStepTeam from "./setup/SetupStepTeam";
import SetupStepPlacement from "./setup/SetupStepPlacement";
import SetupSummaryCard from "./setup/SetupSummaryCard";

export default function Setup({ adminState } = {}) {
  const {
    siteCode,
    setSiteCode,

    apiStatus,
    apiError,
    ensureSessionLoaded,

    setupStep,
    setSetupStep,

    dayDate,
    setDayDate,

    coordinator,
    setCoordinator,

    preparateursList,
    coordosList,
    dayStaff,
    toggleDayStaff,

    postes,
    horaires,
    rotationMinutes,
    currentBlockId,
    assignments,
    setInitialAssignment,

    addPreparateurToList,
    removePreparateurFromList,
    addCoordoToList,
    removeCoordoFromList,

    pauseWaveSize,
    setPauseWaveSize,

    startService,
    goCockpit,
    goAdmin,
    goPlanning, // ✅ NEW (si absent du store, on gère fallback)
    resetDay,

    serviceStartedAt,
    dayStartedAt,

    memberRole,
    resetAuthState,

    cfgStatus,
    cfgError,
  } = useDriveStore();

  const [newPrep, setNewPrep] = useState("");
  const [newCoordo, setNewCoordo] = useState("");

  const [siteDraft, setSiteDraft] = useState((siteCode || "").toUpperCase());

  useEffect(() => {
    setSiteDraft((siteCode || "").toUpperCase());
  }, [siteCode]);

  const adminLoading = !!adminState?.loading;
  const role = adminState?.role ?? memberRole ?? null;
  const isAdmin = adminState?.isAdmin ?? (String(role || "").toLowerCase() === "admin");

  const normUpper = (s) => String(s || "").trim().toUpperCase();
  const normLower = (s) => String(s || "").trim().toLowerCase();

  useEffect(() => {
    ensureSessionLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isServiceRunning = !!(dayStartedAt || serviceStartedAt);

  const setupBlockId = useMemo(
    () => getFirstBlockId(horaires || [], rotationMinutes),
    [horaires, rotationMinutes]
  );

  const effectiveBlockId = useMemo(() => {
    if (!isServiceRunning) return setupBlockId;
    const id = String(currentBlockId ?? "").trim();
    return id ? id : setupBlockId;
  }, [isServiceRunning, currentBlockId, setupBlockId]);

  const blockAssignments = assignments?.[effectiveBlockId] || {};
  const selectedStaff = useMemo(() => (dayStaff || []).slice().sort(), [dayStaff]);

  const hasCoordinator = normUpper(coordinator) !== "";
  const hasStaff = (dayStaff || []).length > 0;

  const allHavePoste = selectedStaff.every((nom) => {
    const key = normUpper(nom);
    return blockAssignments[key] && blockAssignments[key] !== "";
  });

  const canGoStep2 = hasCoordinator && hasStaff;
  const canStart = hasCoordinator && hasStaff && allHavePoste;

  function addPrep() {
    const v = newPrep.trim();
    if (!v) return;
    addPreparateurToList(v);
    setNewPrep("");
  }

  function addCoordo() {
    const v = newCoordo.trim();
    if (!v) return;
    addCoordoToList(v);
    setNewCoordo("");
  }

  const waveMax = useMemo(() => Math.max(1, Math.min(dayStaff?.length || 1, 6)), [dayStaff]);

  async function commitSiteCode() {
    const next = normLower(siteDraft);
    const cur = normLower(siteCode);
    if (!next) return;
    if (next === cur) return;

    try {
      await setSiteCode(next);
    } catch (e) {
      console.error("[setSiteCode]", e);
    }
  }

  // ✅ Hash routing helper (Vercel-safe)
  function pushHash(hash) {
    try {
      if (typeof window === "undefined") return;
      const nextHash = String(hash || "#/");
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
    } catch {}
  }

  function goToAdmin() {
    goAdmin?.();
    pushHash("#/admin");
  }

  function goToCockpitSafe() {
    goCockpit?.();
    pushHash("#/cockpit");
  }

  function goToPlanning() {
    // si l'action existe dans le store, on l'utilise
    goPlanning?.();
    // et on force aussi le hash pour robustesse
    pushHash("#/planning");
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
    } finally {
      resetAuthState?.();
      try {
        // ✅ reset vers hash setup
        window.location.assign("/#/");
      } catch {}
    }
  }

  const ui = {
    surface: {
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    },
    section: {
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 14,
    },
    label: {
      fontSize: 12,
      opacity: 0.78,
      marginBottom: 4,
      display: "block",
      fontWeight: 600,
      letterSpacing: "0.2px",
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
    btn: {
      background: "#1f2937",
      color: "#f9fafb",
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
    btnGhost: {
      background: "rgba(255,255,255,0.03)",
      color: "#f3f4f6",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 12px",
      cursor: "pointer",
      fontWeight: 600,
    },
    smallPill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      fontSize: 12,
      opacity: 0.95,
    },
    summaryCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.10)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
    },
  };

  const apiBadgeColor =
    apiStatus === "error"
      ? "#fca5a5"
      : apiStatus === "offline"
      ? "#fcd34d"
      : apiStatus === "pushed" || apiStatus === "pulled"
      ? "#86efac"
      : "#cbd5e1";

  const hasCfgStatusLine =
    typeof useDriveStore.getState === "function" && "cfgStatus" in useDriveStore.getState();

  return (
    <div className="page">
      <div className="card" style={ui.surface}>
        <SetupHeader
          ui={ui}
          isServiceRunning={isServiceRunning}
          setupStep={setupStep}
          siteDraft={siteDraft}
          setSiteDraft={setSiteDraft}
          commitSiteCode={commitSiteCode}
          normUpper={normUpper}
          siteCode={siteCode}
          dayDate={dayDate}
          setDayDate={setDayDate}
          adminLoading={adminLoading}
          isAdmin={isAdmin}
          goToAdmin={goToAdmin}
          goToCockpitSafe={goToCockpitSafe}
          goToPlanning={goToPlanning} // ✅ NEW (si SetupHeader le supporte)
          handleLogout={handleLogout}
          apiStatus={apiStatus}
          apiError={apiError}
          apiBadgeColor={apiBadgeColor}
          cfgStatus={cfgStatus}
          cfgError={cfgError}
          hasCfgStatusLine={hasCfgStatusLine}
          role={role}
        />

        {/* ✅ Fallback button PlanningRH si SetupHeader n'affiche pas encore le bouton */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 14px 0",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={goToPlanning}
            style={{
              ...ui.btnGhost,
              padding: "8px 12px",
              fontSize: 13,
            }}
            title="Ouvrir le planning RH hebdomadaire"
          >
            📅 Planning RH
          </button>
        </div>

        <SetupStepTabs
          ui={ui}
          setupStep={setupStep}
          setSetupStep={setSetupStep}
          canGoStep2={canGoStep2}
        />

        {setupStep === 1 && (
          <SetupStepTeam
            ui={ui}
            coordosList={coordosList}
            coordinator={coordinator}
            setCoordinator={setCoordinator}
            newCoordo={newCoordo}
            setNewCoordo={setNewCoordo}
            addCoordo={addCoordo}
            removeCoordoFromList={removeCoordoFromList}
            preparateursList={preparateursList}
            dayStaff={dayStaff}
            toggleDayStaff={toggleDayStaff}
            removePreparateurFromList={removePreparateurFromList}
            newPrep={newPrep}
            setNewPrep={setNewPrep}
            addPrep={addPrep}
            pauseWaveSize={pauseWaveSize}
            setPauseWaveSize={setPauseWaveSize}
            waveMax={waveMax}
            resetDay={resetDay}
            canGoStep2={canGoStep2}
            setSetupStep={setSetupStep}
          />
        )}

        {setupStep === 2 && (
          <SetupStepPlacement
            ui={ui}
            selectedStaff={selectedStaff}
            effectiveBlockId={effectiveBlockId}
            isServiceRunning={isServiceRunning}
            blockAssignments={blockAssignments}
            postes={postes}
            setInitialAssignment={setInitialAssignment}
            normUpper={normUpper}
            allHavePoste={allHavePoste}
            canStart={canStart}
            setSetupStep={setSetupStep}
            startService={startService}
          />
        )}
      </div>

      <SetupSummaryCard
        ui={ui}
        siteCode={siteCode}
        dayDate={dayDate}
        coordinator={coordinator}
        dayStaffCount={dayStaff.length}
        pauseWaveSize={pauseWaveSize || 1}
      />
    </div>
  );
}