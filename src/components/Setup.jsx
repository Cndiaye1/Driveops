import React, { useEffect, useMemo, useState } from "react";
import { useDriveStore } from "../store/useDriveStore";
import { getFirstBlockId } from "../utils/blocks";
import { supabase } from "../services/supabaseClient";

import SetupHeader from "./setup/SetupHeader";
import SetupStepTabs from "./setup/SetupStepTabs";
import SetupStepTeam from "./setup/SetupStepTeam";
import SetupStepPlacement from "./setup/SetupStepPlacement";
import SetupSummaryCard from "./setup/SetupSummaryCard";
import { setupUi, getApiBadgeColor } from "./setup/setupTheme";

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
    resetDay,

    serviceStartedAt,
    dayStartedAt,

    memberRole,
    resetAuthState,

    // optionnel si dispo dans store (status config site)
    cfgStatus,
    cfgError,
  } = useDriveStore();

  const [newPrep, setNewPrep] = useState("");
  const [newCoordo, setNewCoordo] = useState("");

  // ✅ input site: draft + commit
  const [siteDraft, setSiteDraft] = useState((siteCode || "").toUpperCase());
  useEffect(() => {
    setSiteDraft((siteCode || "").toUpperCase());
  }, [siteCode]);

  const adminLoading = !!adminState?.loading;
  const role = adminState?.role ?? memberRole ?? null;
  const isAdmin = adminState?.isAdmin ?? (String(role || "").toLowerCase() === "admin");

  const normUpper = (s) => String(s || "").trim().toUpperCase();
  const normLower = (s) => String(s || "").trim().toLowerCase();

  // ✅ Au montage : charge la session (remote) si besoin
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
      await setSiteCode(next); // async (hydrate remote)
    } catch (e) {
      console.error("[setSiteCode]", e);
    }
  }

  // ✅ NAV helpers : important sur Vercel si tu es sur /admin (URL) mais app en screen-based
  function pushUrl(pathname) {
    try {
      if (typeof window !== "undefined" && window.location.pathname !== pathname) {
        window.history.pushState({}, "", pathname);
      }
    } catch {}
  }

  function goToAdmin() {
    goAdmin?.();
    pushUrl("/admin");
  }

  function goToCockpitSafe() {
    goCockpit?.();
    pushUrl("/");
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
    } finally {
      resetAuthState?.();
      try {
        window.location.assign("/");
      } catch {}
    }
  }

  // ✅ garde compatible si le store n’expose pas encore cfgStatus/cfgError
  const showCfgStatus = "cfgStatus" in (useDriveStore.getState?.() || {});
  const ui = setupUi;
  const apiBadgeColor = getApiBadgeColor(apiStatus);

  return (
    <div className="page">
      <div className="card" style={ui.surface}>
        <SetupHeader
          ui={ui}
          isServiceRunning={isServiceRunning}
          setupStep={setupStep}
          siteDraft={siteDraft}
          setSiteDraft={setSiteDraft}
          normUpper={normUpper}
          commitSiteCode={commitSiteCode}
          siteCode={siteCode}
          dayDate={dayDate}
          setDayDate={setDayDate}
          adminLoading={adminLoading}
          isAdmin={isAdmin}
          goToAdmin={goToAdmin}
          goToCockpitSafe={goToCockpitSafe}
          handleLogout={handleLogout}
          apiStatus={apiStatus}
          apiBadgeColor={apiBadgeColor}
          apiError={apiError}
          showCfgStatus={showCfgStatus}
          cfgStatus={cfgStatus}
          cfgError={cfgError}
          role={role}
        />

        <SetupStepTabs
          ui={ui}
          setupStep={setupStep}
          setSetupStep={setSetupStep}
          canGoStep2={canGoStep2}
        />

        {setupStep === 1 && (
          <SetupStepTeam
            ui={ui}
            coordinator={coordinator}
            setCoordinator={setCoordinator}
            coordosList={coordosList || []}
            newCoordo={newCoordo}
            setNewCoordo={setNewCoordo}
            addCoordo={addCoordo}
            removeCoordoFromList={removeCoordoFromList}
            preparateursList={preparateursList || []}
            dayStaff={dayStaff || []}
            toggleDayStaff={toggleDayStaff}
            newPrep={newPrep}
            setNewPrep={setNewPrep}
            addPrep={addPrep}
            removePreparateurFromList={removePreparateurFromList}
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
            effectiveBlockId={effectiveBlockId}
            isServiceRunning={isServiceRunning}
            allHavePoste={allHavePoste}
            selectedStaff={selectedStaff}
            normUpper={normUpper}
            blockAssignments={blockAssignments}
            setInitialAssignment={setInitialAssignment}
            postes={postes || []}
            setSetupStep={setSetupStep}
            canStart={canStart}
            startService={startService}
          />
        )}
      </div>

      <SetupSummaryCard
        ui={ui}
        siteCode={siteCode}
        dayDate={dayDate}
        coordinator={coordinator}
        dayStaffCount={(dayStaff || []).length}
        pauseWaveSize={pauseWaveSize}
      />
    </div>
  );
}
