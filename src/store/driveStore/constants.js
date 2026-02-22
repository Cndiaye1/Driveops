// src/store/driveStore/constants.js
import { todayISO } from "./utils";

// ✅ IMPORTANT: site_code = lowercase (DB/RLS/API alignés)
export const DEFAULT_SITE_CODE = String(import.meta.env.VITE_SITE_CODE || "melun")
  .trim()
  .toLowerCase();

export const TABLE = "drive_sessions";

export const defaultState = {
  siteCode: DEFAULT_SITE_CODE,

  // UI only (local)
  screen: "setup", // setup | cockpit | admin
  setupStep: 1,
  wallMode: false,
  printMode: false,

  // ✅ référentiels + règles (par site) — seront remplacés par drive_site_config dès que chargé
  preparateursList: ["STEVE", "THÉRY", "JOHN", "MIKE", "TOM"],
  coordosList: ["STEVE", "THÉRY", "JOHN"],
  postes: ["ACCUEIL", "PGC", "FS", "LIV", "MES", "LAD", "FLEG/SURG", "RE", "NET", "PAUSE"],
  horaires: [
    "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00",
    "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00",
  ],

  rotationMinutes: 120,
  rotationWarnMinutes: 10,
  pauseAfterMinutes: 180,
  pauseDurationMinutes: 30,
  pauseWaveSize: 1,
  syncBlocksToSystemClock: true,

  // ✅ journée (par jour)
  dayDate: todayISO(),
  coordinator: "",
  dayStaff: [],

  dayStartedAt: null,
  blockStartedAt: null,
  serviceStartedAt: null,
  currentBlockId: "0",
  rotationImminent: false,
  rotationLocked: false,

  assignments: {},
  pauseTakenAt: {},
  skipRotation: {},
  pausePrevPoste: {},
  returnAlertUntil: {},

  // statuses
  apiStatus: "idle", // idle|syncing|pulled|pushed|offline|error
  apiError: "",

  cfgStatus: "idle", // idle|loading|loaded|saving|offline|error
  cfgError: "",

  _sessionLoadedKey: null,
  _subscribedKey: null,
  _cfgLoadedSite: null,

  _saving: false,
  _lastRemoteUpdatedAt: null,
  _lastLocalWriteAt: 0,
  _error: null,

  _pendingSave: false,
  _retryCount: 0,

  _cfgSaving: false,
  _cfgPendingSave: false,
  _cfgRetryCount: 0,
  _cfgLastWriteAt: 0,

  _hasHydrated: false,

  // ✅ Auth / RBAC (local)
  memberRole: null, // admin|manager|user|null
};
