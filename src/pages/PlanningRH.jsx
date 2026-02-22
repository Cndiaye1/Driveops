// src/pages/PlanningRH.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

// ✅ Sprint 3 utils (version PRO / stable)
import * as PlanningRules from "../utils/planningRules";
import * as PlanningAnalyzer from "../utils/planningAnalyzer";
import * as PlanningAutoBalance from "../utils/planningAutoBalance";

/* =========================================================
   PlanningRH v2.7 PRO (DriveOps) — Sprint 3 stable + doc.config editor
   - Semaine RH (stockage = lundi)
   - Affichage grille = Dimanche -> Samedi (terrain)
   - Supabase-ready + fallback localStorage
   - Analyse RH (règles / écarts / besoins / couverture / coût)
   - Auto-balance (contrat + contraintes + couverture)
   - Éditeur JSON intégré pour doc.config
   - Print A4 paysage v2+ (créneau + badge code séparés)
   ========================================================= */

const ABSENCE_CODES = ["RH", "CP", "OFF", "AT", "MAL", "ABS"];
const QUICK_SHIFTS = [
  { label: "Matin", value: "06:00-13:30" },
  { label: "Journée", value: "09:00-17:00" },
  { label: "Fermeture", value: "13:30-21:00" },
  { label: "Court matin", value: "06:00-10:00" },
  { label: "Midi", value: "11:00-15:00" },
  { label: "Soir", value: "17:00-21:30" },
  { label: "Repos", value: "RH" },
  { label: "CP", value: "CP" },
  { label: "OFF", value: "OFF" },
];

const DAY_LABELS_UI = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]; // affichage
const DAY_KEYS_MON_START = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]; // stockage logique lundi->dimanche
const DAY_KEYS_UI_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // affichage dimanche->samedi

const LS_PREFIX = "driveops_rh_planning_v1";

// ---------- utils date / semaine
function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromISODate(iso) {
  const [y, m, dd] = String(iso || "").split("-").map(Number);
  if (!y || !m || !dd) return new Date();
  return new Date(y, m - 1, dd);
}

// lundi de la semaine
function getWeekStartMonday(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay(); // 0 dim ... 6 sam
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return d;
}

// dates d'affichage dimanche->samedi à partir d'un lundi
function getDisplayWeekDatesFromMonday(weekStartMondayISO) {
  const mon = fromISODate(weekStartMondayISO);
  const out = [];

  // dimanche = lundi -1
  const sun = new Date(mon);
  sun.setDate(mon.getDate() - 1);

  for (let i = 0; i < 7; i++) {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    out.push(d);
  }
  return out;
}

function addDays(iso, days) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function formatFrShort(date) {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatWeekRangeLabel(weekStartMondayISO) {
  const mon = fromISODate(weekStartMondayISO);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  return `${mon.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  })} → ${sun.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

// ---------- utils planning / heures
function normalizeName(v) {
  return String(v || "").trim().toUpperCase();
}

function isAbsenceCode(v) {
  return ABSENCE_CODES.includes(String(v || "").trim().toUpperCase());
}

function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function safeParseCellDetailed(cell) {
  const candidates = [
    PlanningRules.parseShiftCellDetailed,
    PlanningRules.parseCell,
    PlanningRules.getCellDetails,
    PlanningRules.defaultParseShiftCellDetailed,
  ];

  for (const fn of candidates) {
    try {
      if (typeof fn === "function") {
        const res = fn(cell);
        if (res && typeof res === "object") return res;
      }
    } catch (e) {
      console.warn("[PlanningRH] parse cell helper error:", e?.message || e);
    }
  }

  // fallback local
  const raw = String(cell || "").trim();
  const normalized = raw.toUpperCase().replaceAll("H", ":").replace(/\s+/g, "");
  if (!normalized) {
    return {
      type: "empty",
      isWork: false,
      isAbsence: false,
      valid: true,
      code: "",
      absenceCode: "",
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw,
    };
  }
  if (isAbsenceCode(normalized)) {
    return {
      type: "absence",
      isWork: false,
      isAbsence: true,
      valid: true,
      code: normalized,
      absenceCode: normalized,
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw,
    };
  }

  const m = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\/([A-Z0-9_-]+))?$/);
  if (!m) {
    return {
      type: "invalid",
      isWork: false,
      isAbsence: false,
      valid: false,
      code: "",
      absenceCode: "",
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw,
    };
  }

  const code = String(m[3] || "").toUpperCase();
  if (code && isAbsenceCode(code)) {
    return {
      type: "absence",
      isWork: false,
      isAbsence: true,
      valid: true,
      code,
      absenceCode: code,
      startHHMM: "",
      endHHMM: "",
      durationMin: 0,
      raw,
    };
  }

  const start = hhmmToMin(m[1]);
  const endRaw = hhmmToMin(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(endRaw)) {
    return {
      type: "invalid",
      isWork: false,
      isAbsence: false,
      valid: false,
      code,
      absenceCode: "",
      startHHMM: m[1],
      endHHMM: m[2],
      durationMin: 0,
      raw,
    };
  }

  let end = endRaw;
  let diff = end - start;
  if (diff < 0) {
    diff += 24 * 60;
    end += 24 * 60;
  }

  return {
    type: "work",
    isWork: true,
    isAbsence: false,
    valid: true,
    code,
    absenceCode: "",
    startHHMM: m[1],
    endHHMM: m[2],
    startMin: start,
    endMin: end,
    durationMin: Math.max(0, diff),
    raw,
  };
}

function parseShiftToMinutes(cell) {
  const d = safeParseCellDetailed(cell);
  return d?.isWork ? Number(d.durationMin) || 0 : 0;
}

function minutesToHourLabel(min) {
  const sign = Number(min) < 0 ? "-" : "";
  const abs = Math.abs(Number(min) || 0);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}h${pad2(m)}` : `${sign}${h}h`;
}

function computeRowWeeklyMinutes(cells = {}) {
  return DAY_KEYS_MON_START.reduce((sum, k) => sum + parseShiftToMinutes(cells[k]), 0);
}

function parseContractHours(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 35;
  return Math.max(0, n);
}

function getCellTone(value) {
  const d = safeParseCellDetailed(value);
  if (!d || d.type === "empty") return "empty";
  if (d.type === "absence") {
    const code = String(d.absenceCode || d.code || "").toUpperCase();
    if (code === "RH" || code === "OFF") return "rest";
    if (code === "CP") return "cp";
    return "alert";
  }
  if (d.type === "work") return "work";
  return "unknown";
}

function getPrintableCellParts(value) {
  const d = safeParseCellDetailed(value);
  if (!d || d.type === "empty") return { kind: "empty", shift: "", badge: "" };
  if (d.type === "absence") {
    const code = String(d.absenceCode || d.code || String(value || "").toUpperCase());
    return { kind: "absence", shift: "", badge: code };
  }
  if (d.type === "work") {
    return {
      kind: "work",
      shift: d.startHHMM && d.endHHMM ? `${d.startHHMM}-${d.endHHMM}` : String(value || ""),
      badge: d.code || "",
    };
  }
  return { kind: "invalid", shift: "", badge: String(value || "") };
}

function formatCurrencyEUR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------- modèle data
function makeEmptyCells() {
  return {
    mon: "",
    tue: "",
    wed: "",
    thu: "",
    fri: "",
    sat: "",
    sun: "",
  };
}

function makeRow(name, contractHours = 35) {
  const safeId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());

  return {
    id: safeId,
    name: normalizeName(name),
    contractHours: parseContractHours(contractHours),
    role: "prep", // prep | coordo | autre
    cells: makeEmptyCells(),
    notes: "",
    skills: [], // ex ["drive","frais","caisse"]
    availability: {}, // ex { mon: false, tue: ["06:00-14:00"] }
    hourlyRate: undefined, // optionnel (sinon analyzer fallback rôle/default)
  };
}

function makePlanningDoc({ siteCode, weekStartMonday, rows = [] }) {
  return {
    siteCode,
    weekStartMonday,
    rows,
    updatedAt: new Date().toISOString(),
    version: 2,
    config: {}, // ✅ doc.config intégré
  };
}

// ---------- storage keys
function localKey(siteCode, weekStartMonday) {
  return `${LS_PREFIX}__${String(siteCode || "").toLowerCase()}__${weekStartMonday}`;
}

// ---------- Supabase (fallback local si table absente)
async function loadPlanningRemote(siteCode, weekStartMonday) {
  const { data, error } = await supabase
    .from("drive_rh_plannings")
    .select("site_code, week_start, data_json, updated_at")
    .eq("site_code", String(siteCode || "").toLowerCase())
    .eq("week_start", weekStartMonday)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function savePlanningRemote(siteCode, weekStartMonday, dataJson) {
  const payload = {
    site_code: String(siteCode || "").toLowerCase(),
    week_start: weekStartMonday,
    data_json: dataJson,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("drive_rh_plannings")
    .upsert(payload, { onConflict: "site_code,week_start" });

  if (error) throw error;
}

// ---------- adapters utilitaires Sprint 3 (robustes)
function safeCall(fn, ...args) {
  try {
    if (typeof fn === "function") return fn(...args);
  } catch (e) {
    console.warn("[PlanningRH] util call error:", e?.message || e);
  }
  return null;
}

function buildAnalyzerInput({ doc, rowsWithStats, normalizedSite, weekStartMonday }) {
  const cfg = doc?.config || {};
  const costing = cfg?.costing || {};
  const defaults = cfg?.defaults || {};

  // ✅ on "flatten" doc.config vers les clés que l'analyzer sait aussi lire
  const mergedDefaults = {
    ...defaults,
    hourlyRate:
      Number(costing?.defaultHourlyRate) > 0
        ? Number(costing.defaultHourlyRate)
        : defaults?.hourlyRate,
    hourlyRateByRole: {
      ...(defaults?.hourlyRateByRole || {}),
      ...(costing?.hourlyRatesByRole || {}),
    },
    coverage: {
      ...(defaults?.coverage || {}),
      ...(cfg?.coverage || {}),
      ...(cfg?.coverageConfig || {}),
    },
  };

  return {
    siteCode: normalizedSite,
    weekStartMonday,
    dayKeysMonStart: DAY_KEYS_MON_START,
    dayKeysUiOrder: DAY_KEYS_UI_ORDER,

    // sources brutes
    planningDoc: doc,
    docConfig: cfg,

    // ✅ flattened compat analyzer
    defaults: mergedDefaults,
    coverageConfig: {
      ...(cfg?.coverage || {}),
      ...(cfg?.coverageConfig || {}),
    },
    requirementsByDaySlot: cfg?.requirementsByDaySlot || {},
    coverageRequirements: cfg?.requirementsByDaySlot || {},

    rows: (doc?.rows || []).map((r) => ({
      ...r,
      contractHours: Number(r.contractHours) || 0,
      weeklyMinutes: computeRowWeeklyMinutes(r.cells || {}),
      weeklyHours: Math.round((computeRowWeeklyMinutes(r.cells || {}) / 60) * 100) / 100,
    })),

    rowsWithStats,
  };
}

function runPlanningAnalysis(input) {
  const candidates = [
    PlanningAnalyzer.analyzePlanning,
    PlanningAnalyzer.analyzeWeekPlanning,
    PlanningAnalyzer.getPlanningAnalysis,
    PlanningAnalyzer.computePlanningAnalysis,
    PlanningAnalyzer.default,
  ];

  for (const c of candidates) {
    const res = safeCall(c, input);
    if (res) return res;
  }

  // fallback local minimal
  const rows = input?.rows || [];
  const warnings = [];
  const byDay = {};
  const coverageSummary = { byDay: {} };

  for (const d of DAY_KEYS_MON_START) {
    let plannedCount = 0;
    for (const r of rows) {
      const v = r?.cells?.[d];
      if (parseShiftToMinutes(v) > 0) plannedCount += 1;
    }
    byDay[d] = { plannedCount };
    coverageSummary.byDay[d] = {
      totalGap: 0,
      totalNeed: 0,
      totalPlanned: plannedCount,
      skillGapsCount: 0,
    };
  }

  rows.forEach((r) => {
    const plannedMin = computeRowWeeklyMinutes(r.cells || {});
    const targetMin = (Number(r.contractHours) || 0) * 60;
    const delta = plannedMin - targetMin;
    if (Math.abs(delta) > 60) {
      warnings.push({
        type: "contract_delta",
        staff: r.name,
        deltaMinutes: delta,
        severity: Math.abs(delta) >= 180 ? "high" : "medium",
        message: `${r.name}: écart contrat ${delta > 0 ? "+" : ""}${minutesToHourLabel(delta)}`,
      });
    }
  });

  return {
    summary: {
      staffCount: rows.length,
      warningsCount: warnings.length,
      coverageGapCount: 0,
      coverageGapsCount: 0,
      skillCoverageGapsCount: 0,
      estimatedCost: 0,
      estimatedPayrollCost: 0,
      totalPlannedMinutes: rows.reduce((s, r) => s + computeRowWeeklyMinutes(r.cells || {}), 0),
      totalTargetMinutes: rows.reduce((s, r) => s + ((Number(r.contractHours) || 0) * 60), 0),
      totalDeltaMinutes:
        rows.reduce((s, r) => s + computeRowWeeklyMinutes(r.cells || {}), 0) -
        rows.reduce((s, r) => s + ((Number(r.contractHours) || 0) * 60), 0),
    },
    byDay,
    warnings,
    rulesResults: [],
    needsBySlot: [],
    coverageGaps: [],
    coverageSummary,
    costs: { totalEstimated: 0, currency: "EUR" },
  };
}

function runPlanningRules(input) {
  const candidates = [
    PlanningRules.evaluatePlanningRules,
    PlanningRules.checkPlanningRules,
    PlanningRules.runPlanningRules,
    PlanningRules.validatePlanningRules,
    PlanningRules.default,
  ];

  for (const c of candidates) {
    const res = safeCall(c, input);
    if (res) return res;
  }

  return { violations: [], warnings: [] };
}

// ✅ runAutoBalance accepte maintenant input + options (important)
function runAutoBalance(input, options) {
  const candidates = [
    PlanningAutoBalance.autoBalancePlanning,
    PlanningAutoBalance.runAutoBalance,
    PlanningAutoBalance.balancePlanning,
    PlanningAutoBalance.computeAutoBalance,
    PlanningAutoBalance.default,
  ];

  for (const c of candidates) {
    const res = safeCall(c, input, options);
    if (res) return res;
  }

  return null;
}

function applyAutoBalanceResultToRows(currentRows, result) {
  if (!result) return null;

  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.updatedRows)) return result.updatedRows;

  if (Array.isArray(result.patches)) {
    const rows = (currentRows || []).map((r) => ({ ...r, cells: { ...(r.cells || {}) } }));
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const p of result.patches) {
      const row = byId.get(p.rowId);
      if (!row) continue;
      if (!row.cells) row.cells = makeEmptyCells();
      row.cells[p.dayKey] = String(p.value || "").toUpperCase().trim();
    }
    return rows;
  }

  return null;
}

function deriveCoverageByDayMini(analysis) {
  const direct = analysis?.coverageSummary?.byDay;
  if (direct && typeof direct === "object") {
    return DAY_KEYS_MON_START.map((k) => ({
      dayKey: k,
      totalGap: Number(direct?.[k]?.totalGap || 0),
      totalNeed: Number(direct?.[k]?.totalNeed || 0),
      totalPlanned: Number(direct?.[k]?.totalPlanned || 0),
      skillGapsCount: Number(direct?.[k]?.skillGapsCount || 0),
    }));
  }

  // fallback depuis needsBySlot
  const needs = Array.isArray(analysis?.needsBySlot) ? analysis.needsBySlot : [];
  return DAY_KEYS_MON_START.map((k) => {
    const slots = needs.filter((s) => s.dayKey === k);
    return {
      dayKey: k,
      totalGap: slots.reduce((sum, s) => sum + (Number(s.totalGap) || 0), 0),
      totalNeed: slots.reduce((sum, s) => sum + (Number(s.requiredTotal) || 0), 0),
      totalPlanned: slots.reduce((sum, s) => sum + (Number(s.plannedTotal) || 0), 0),
      skillGapsCount: slots.reduce(
        (sum, s) => sum + (Array.isArray(s.skillGaps) ? s.skillGaps.filter((g) => g.gap > 0).length : 0),
        0
      ),
    };
  });
}

export default function PlanningRH({ adminState }) {
  const siteCode = useDriveStore((s) => s.siteCode);
  const preparateursList = useDriveStore((s) => s.preparateursList || []);
  const coordosList = useDriveStore((s) => s.coordosList || []);

  const goSetup = useDriveStore((s) => s.goSetup);
  const goCockpit = useDriveStore((s) => s.goCockpit);

  const [weekStartMonday, setWeekStartMonday] = useState(() =>
    toISODate(getWeekStartMonday(new Date()))
  );

  const [doc, setDoc] = useState(() =>
    makePlanningDoc({
      siteCode: String(siteCode || "").toLowerCase(),
      weekStartMonday: toISODate(getWeekStartMonday(new Date())),
      rows: [],
    })
  );

  const [selectedRowId, setSelectedRowId] = useState(null);
  const [selectedDayKey, setSelectedDayKey] = useState("mon");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle|saved|error|offline
  const [saveError, setSaveError] = useState("");

  const [search, setSearch] = useState("");
  const [showOnlyDiff, setShowOnlyDiff] = useState(false);
  const [autoAddFromDriveOpsDone, setAutoAddFromDriveOpsDone] = useState(false);

  // Sprint 3 UI
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(true);
  const [analysisRefreshTick, setAnalysisRefreshTick] = useState(0);
  const [autoBalanceRunning, setAutoBalanceRunning] = useState(false);
  const [autoBalanceMessage, setAutoBalanceMessage] = useState("");

  // ✅ Éditeur JSON doc.config
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [docConfigText, setDocConfigText] = useState("{}");
  const [docConfigError, setDocConfigError] = useState("");
  const [docConfigSavedMsg, setDocConfigSavedMsg] = useState("");
  const [docConfigDirty, setDocConfigDirty] = useState(false);

  const normalizedSite = useMemo(
    () => String(siteCode || "").trim().toLowerCase(),
    [siteCode]
  );

  const displayWeekDates = useMemo(
    () => getDisplayWeekDatesFromMonday(weekStartMonday),
    [weekStartMonday]
  );

  const displayDayMeta = useMemo(() => {
    return DAY_KEYS_UI_ORDER.map((k, idx) => ({
      key: k,
      label: DAY_LABELS_UI[idx],
      date: displayWeekDates[idx],
      dateLabel: formatFrShort(displayWeekDates[idx]),
    }));
  }, [displayWeekDates]);

  // ---------- load (Supabase -> fallback local)
  const loadWeek = useCallback(async () => {
    if (!normalizedSite || !weekStartMonday) return;

    setLoading(true);
    setSaveError("");

    try {
      let loaded = null;

      try {
        const remote = await loadPlanningRemote(normalizedSite, weekStartMonday);
        if (remote?.data_json) {
          loaded = {
            ...makePlanningDoc({
              siteCode: normalizedSite,
              weekStartMonday,
              rows: [],
            }),
            ...remote.data_json,
            siteCode: normalizedSite,
            weekStartMonday,
          };
        }
      } catch (e) {
        console.warn("[PlanningRH] remote load fallback local:", e?.message || e);
      }

      if (!loaded) {
        const raw = localStorage.getItem(localKey(normalizedSite, weekStartMonday));
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            loaded = {
              ...makePlanningDoc({ siteCode: normalizedSite, weekStartMonday, rows: [] }),
              ...parsed,
              siteCode: normalizedSite,
              weekStartMonday,
            };
          } catch {
            // ignore parse local
          }
        }
      }

      if (!loaded) {
        loaded = makePlanningDoc({
          siteCode: normalizedSite,
          weekStartMonday,
          rows: [],
        });
      }

      // sécurité schema
      loaded.rows = Array.isArray(loaded.rows)
        ? loaded.rows.map((r) => ({
            id:
              r.id ||
              (typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : String(Date.now() + Math.random())),
            name: normalizeName(r.name),
            contractHours: parseContractHours(r.contractHours ?? 35),
            role: r.role || "prep",
            cells: { ...makeEmptyCells(), ...(r.cells || {}) },
            notes: r.notes || "",
            skills: Array.isArray(r.skills) ? r.skills : [],
            availability: r.availability && typeof r.availability === "object" ? r.availability : {},
            hourlyRate:
              Number.isFinite(Number(r.hourlyRate)) && Number(r.hourlyRate) > 0
                ? Number(r.hourlyRate)
                : undefined,
          }))
        : [];

      loaded.config = loaded.config && typeof loaded.config === "object" ? loaded.config : {};

      setDoc(loaded);
      setSaveStatus("idle");
      setAnalysisRefreshTick((x) => x + 1);
    } finally {
      setLoading(false);
    }
  }, [normalizedSite, weekStartMonday]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  // ---------- sync editor text when doc.config changes (if not actively dirty)
  useEffect(() => {
    if (docConfigDirty && showConfigEditor) return;
    try {
      setDocConfigText(JSON.stringify(doc?.config || {}, null, 2));
      setDocConfigError("");
    } catch {
      setDocConfigText("{}");
    }
  }, [doc?.config, showConfigEditor, docConfigDirty]);

  // ---------- auto-ajout collaborateurs depuis DriveOps (1 fois après load)
  useEffect(() => {
    if (loading) return;
    if (autoAddFromDriveOpsDone) return;
    if (!doc?.rows) return;

    const existing = new Set(doc.rows.map((r) => normalizeName(r.name)));
    const prepNames = (preparateursList || []).map(normalizeName).filter(Boolean);
    const coordNames = (coordosList || []).map(normalizeName).filter(Boolean);

    const toAdd = [];

    for (const n of prepNames) {
      if (!existing.has(n)) {
        toAdd.push({ ...makeRow(n, 35), role: "prep" });
        existing.add(n);
      }
    }

    for (const n of coordNames) {
      if (!existing.has(n)) {
        toAdd.push({ ...makeRow(n, 35), role: "coordo" });
        existing.add(n);
      }
    }

    if (toAdd.length > 0) {
      setDoc((prev) => ({
        ...prev,
        rows: [...prev.rows, ...toAdd].sort((a, b) => a.name.localeCompare(b.name, "fr")),
        updatedAt: new Date().toISOString(),
      }));
      setAnalysisRefreshTick((x) => x + 1);
    }

    setAutoAddFromDriveOpsDone(true);
  }, [loading, autoAddFromDriveOpsDone, doc?.rows, preparateursList, coordosList]);

  useEffect(() => {
    setAutoAddFromDriveOpsDone(false);
  }, [weekStartMonday, normalizedSite]);

  // ---------- autosave (local immédiat + remote debounce)
  useEffect(() => {
    if (!doc || !normalizedSite || !weekStartMonday) return;

    try {
      localStorage.setItem(localKey(normalizedSite, weekStartMonday), JSON.stringify(doc));
    } catch {}

    const t = setTimeout(async () => {
      setSaving(true);
      setSaveError("");

      try {
        try {
          await savePlanningRemote(normalizedSite, weekStartMonday, doc);
          setSaveStatus("saved");
        } catch (e) {
          console.warn("[PlanningRH] remote save fallback local:", e?.message || e);
          setSaveStatus("offline");
          setSaveError("Sauvegarde locale OK (Supabase non disponible / table non prête).");
        }
      } catch (e) {
        console.error(e);
        setSaveStatus("error");
        setSaveError("Erreur de sauvegarde.");
      } finally {
        setSaving(false);
      }
    }, 450);

    return () => clearTimeout(t);
  }, [doc, normalizedSite, weekStartMonday]);

  // ---------- doc.config editor actions
  const handleToggleConfigEditor = useCallback(() => {
    setShowConfigEditor((v) => {
      const next = !v;
      if (!v) {
        try {
          setDocConfigText(JSON.stringify(doc?.config || {}, null, 2));
          setDocConfigError("");
          setDocConfigSavedMsg("");
          setDocConfigDirty(false);
        } catch {
          setDocConfigText("{}");
        }
      }
      return next;
    });
  }, [doc?.config]);

  const handleFormatDocConfig = useCallback(() => {
    setDocConfigError("");
    setDocConfigSavedMsg("");
    try {
      const parsed = JSON.parse(docConfigText || "{}");
      setDocConfigText(JSON.stringify(parsed, null, 2));
      setDocConfigDirty(true);
    } catch (e) {
      setDocConfigError(`JSON invalide : ${e?.message || e}`);
    }
  }, [docConfigText]);

  const handleApplyDocConfig = useCallback(() => {
    setDocConfigError("");
    setDocConfigSavedMsg("");
    try {
      const parsed = JSON.parse(docConfigText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Le doc.config doit être un objet JSON");
      }

      setDoc((prev) => ({
        ...prev,
        config: parsed,
        updatedAt: new Date().toISOString(),
      }));

      setDocConfigText(JSON.stringify(parsed, null, 2));
      setDocConfigDirty(false);
      setDocConfigSavedMsg("doc.config appliqué ✅");
      setAnalysisRefreshTick((x) => x + 1);
    } catch (e) {
      setDocConfigError(`JSON invalide : ${e?.message || e}`);
    }
  }, [docConfigText]);

  const handleResetDocConfig = useCallback(() => {
    const ok = window.confirm("Réinitialiser doc.config à {} ?");
    if (!ok) return;
    setDocConfigText("{}");
    setDocConfigDirty(true);
    setDocConfigError("");
    setDocConfigSavedMsg("");
  }, []);

  const handleCopyDocConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(docConfigText || "{}");
      setDocConfigSavedMsg("JSON copié ✅");
      setTimeout(() => setDocConfigSavedMsg(""), 1200);
    } catch {
      setDocConfigSavedMsg("Copie impossible (navigateur) ⚠️");
      setTimeout(() => setDocConfigSavedMsg(""), 1500);
    }
  }, [docConfigText]);

  // ---------- mutations
  const upsertRow = useCallback((rowId, patch) => {
    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
    setAnalysisRefreshTick((x) => x + 1);
  }, []);

  const setCell = useCallback((rowId, dayKey, value) => {
    const clean = String(value || "").trim().toUpperCase();
    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: prev.rows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              cells: {
                ...r.cells,
                [dayKey]: clean,
              },
            }
          : r
      ),
    }));
    setAnalysisRefreshTick((x) => x + 1);
  }, []);

  const addEmployeeRow = useCallback(() => {
    const row = makeRow("", 35);
    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: [...prev.rows, row],
    }));
    setSelectedRowId(row.id);
    setAnalysisRefreshTick((x) => x + 1);
  }, []);

  const removeEmployeeRow = useCallback((rowId) => {
    const ok = window.confirm("Supprimer cette ligne du planning RH ?");
    if (!ok) return;

    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: prev.rows.filter((r) => r.id !== rowId),
    }));

    setSelectedRowId((cur) => (cur === rowId ? null : cur));
    setAnalysisRefreshTick((x) => x + 1);
  }, []);

  const duplicateWeekToNext = useCallback(() => {
    const nextMonday = addDays(weekStartMonday, 7);
    try {
      const cloned = {
        ...doc,
        weekStartMonday: nextMonday,
        updatedAt: new Date().toISOString(),
        rows: (doc.rows || []).map((r) => ({
          ...r,
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : String(Date.now() + Math.random()),
        })),
      };
      localStorage.setItem(localKey(normalizedSite, nextMonday), JSON.stringify(cloned));
      alert("Semaine copiée localement vers la semaine suivante ✅");
    } catch {
      alert("Copie locale impossible.");
    }
  }, [doc, normalizedSite, weekStartMonday]);

  const clearWeek = useCallback(() => {
    const ok = window.confirm("Vider toute la semaine (toutes les cellules) ?");
    if (!ok) return;

    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: prev.rows.map((r) => ({ ...r, cells: makeEmptyCells() })),
    }));
    setAnalysisRefreshTick((x) => x + 1);
  }, []);

  const applyQuickShiftToSelection = useCallback(
    (value) => {
      if (!selectedRowId || !selectedDayKey) {
        alert("Sélectionne d’abord une cellule (ligne + jour).");
        return;
      }
      setCell(selectedRowId, selectedDayKey, value);
    },
    [selectedRowId, selectedDayKey, setCell]
  );

  // ---------- vues calculées
  const filteredRows = useMemo(() => {
    const q = normalizeName(search);
    return (doc.rows || []).filter((r) => {
      const weeklyMin = computeRowWeeklyMinutes(r.cells);
      const targetMin = parseContractHours(r.contractHours) * 60;
      const hasDiff = weeklyMin !== targetMin;

      const okSearch = !q || normalizeName(r.name).includes(q);
      const okDiff = !showOnlyDiff || hasDiff;
      return okSearch && okDiff;
    });
  }, [doc.rows, search, showOnlyDiff]);

  const rowsWithStats = useMemo(() => {
    return filteredRows.map((r) => {
      const weeklyMin = computeRowWeeklyMinutes(r.cells);
      const targetMin = parseContractHours(r.contractHours) * 60;
      const diffMin = weeklyMin - targetMin;
      return { ...r, weeklyMin, targetMin, diffMin };
    });
  }, [filteredRows]);

  const allRowsWithStats = useMemo(() => {
    return (doc.rows || []).map((r) => {
      const weeklyMin = computeRowWeeklyMinutes(r.cells);
      const targetMin = parseContractHours(r.contractHours) * 60;
      const diffMin = weeklyMin - targetMin;
      return { ...r, weeklyMin, targetMin, diffMin };
    });
  }, [doc.rows]);

  const totals = useMemo(() => {
    const totalPlanned = rowsWithStats.reduce((s, r) => s + r.weeklyMin, 0);
    const totalTarget = rowsWithStats.reduce((s, r) => s + r.targetMin, 0);
    return {
      staff: rowsWithStats.length,
      totalPlanned,
      totalTarget,
      diff: totalPlanned - totalTarget,
    };
  }, [rowsWithStats]);

  // ---------- Sprint 3 analyse branchée utilitaires
  const analysisInput = useMemo(
    () =>
      buildAnalyzerInput({
        doc,
        rowsWithStats: allRowsWithStats,
        normalizedSite,
        weekStartMonday,
      }),
    [doc, allRowsWithStats, normalizedSite, weekStartMonday, analysisRefreshTick]
  );

  const analysisResult = useMemo(() => {
    const analysis = runPlanningAnalysis(analysisInput);
    const rules = runPlanningRules(analysisInput);

    return {
      analysis,
      rules,
    };
  }, [analysisInput]);

  const compactAlerts = useMemo(() => {
    const arr = [];

    const aw = analysisResult?.analysis?.warnings || [];
    for (const w of aw.slice(0, 8)) {
      arr.push({
        level: w.severity || "info",
        text: w.message || `${w.staff || "?"} — alerte planning`,
      });
    }

    const rv = analysisResult?.rules?.violations || [];
    for (const v of rv.slice(0, 8)) {
      arr.push({
        level: v.severity || "warning",
        text: v.message || v.label || "Violation règle RH",
      });
    }

    const cg = (analysisResult?.analysis?.coverageGaps || []).slice(0, 8);
    for (const g of cg) {
      arr.push({
        level: g.severity || "warning",
        text: g.message || `${g.dayKey?.toUpperCase() || ""} ${g.slotKey || ""} — gap couverture`,
      });
    }

    if (arr.length === 0) {
      const majorDiff = (allRowsWithStats || [])
        .filter((r) => Math.abs(r.diffMin) >= 120)
        .slice(0, 6)
        .map((r) => ({
          level: Math.abs(r.diffMin) >= 240 ? "high" : "warning",
          text: `${r.name} : ${r.diffMin > 0 ? "sur" : "sous"}-planifié de ${minutesToHourLabel(
            Math.abs(r.diffMin)
          )}`,
        }));
      arr.push(...majorDiff);
    }

    return arr.slice(0, 12);
  }, [analysisResult, allRowsWithStats]);

  const topCoverageGaps = useMemo(() => {
    return [...(analysisResult?.analysis?.coverageGaps || [])]
      .sort((a, b) => (Number(b.gap) || 0) - (Number(a.gap) || 0))
      .slice(0, 8);
  }, [analysisResult]);

  const coverageByDayMini = useMemo(() => {
    return deriveCoverageByDayMini(analysisResult?.analysis);
  }, [analysisResult]);

  const handleRunAutoBalance = useCallback(async () => {
    if (autoBalanceRunning) return;

    setAutoBalanceRunning(true);
    setAutoBalanceMessage("");

    try {
      const result = runAutoBalance(
        {
          ...analysisInput,
          rows: doc.rows || [],
        },
        {
          mode: "contract-balance",
          toleranceMinutes: 30,
          keepAbsenceCodes: true,
          preserveManualCodes: true,
          allowSetRestOnOverplan: true,
          rebalanceCoverage: true,
          maxPatches: 80,
        }
      );

      if (!result) {
        setAutoBalanceMessage("Auto-balance indisponible (utilitaire non exposé ou pas encore finalisé).");
        return;
      }

      const nextRows = applyAutoBalanceResultToRows(doc.rows || [], result);

      if (!nextRows) {
        setAutoBalanceMessage("Auto-balance exécuté, mais format de retour non reconnu.");
        return;
      }

      setDoc((prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        rows: nextRows,
      }));
      setAnalysisRefreshTick((x) => x + 1);

      const appliedCount =
        Number(result.appliedCount) ||
        (Array.isArray(result.patches) ? result.patches.length : 0) ||
        0;

      const rem = result?.diagnostics?.remainingPatchBudget;
      const extra = typeof rem === "number" ? ` • budget restant ${rem}` : "";

      setAutoBalanceMessage(
        appliedCount > 0
          ? `Auto-balance appliqué ✅ (${appliedCount} ajustement${appliedCount > 1 ? "s" : ""}${extra})`
          : "Auto-balance exécuté ✅ (aucun ajustement nécessaire)"
      );
    } catch (e) {
      console.error(e);
      setAutoBalanceMessage(`Erreur auto-balance : ${e?.message || e}`);
    } finally {
      setAutoBalanceRunning(false);
    }
  }, [autoBalanceRunning, analysisInput, doc.rows]);

  const handlePrint = useCallback(() => {
    try {
      window.print();
    } catch {}
  }, []);

  const ui = {
    page: {
      maxWidth: 1460,
      margin: "16px auto",
      padding: "0 12px",
      color: "#e8eefc",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    },
    card: {
      border: "1px solid rgba(255,255,255,0.10)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
      borderRadius: 16,
      padding: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      overflow: "hidden",
    },
    btn: {
      background: "rgba(255,255,255,0.03)",
      color: "#f3f4f6",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 600,
      whiteSpace: "nowrap",
    },
    btnPrimary: {
      background: "linear-gradient(180deg, #ef4444, #dc2626)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 8px 18px rgba(220,38,38,0.25)",
      whiteSpace: "nowrap",
    },
    btnWarn: {
      background: "linear-gradient(180deg, #f59e0b, #d97706)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 700,
      whiteSpace: "nowrap",
    },
    btnSuccess: {
      background: "linear-gradient(180deg, #10b981, #059669)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 700,
      whiteSpace: "nowrap",
    },
    input: {
      width: "100%",
      background: "#0f172a",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 10,
      padding: "8px 10px",
      outline: "none",
      boxSizing: "border-box",
    },
    th: {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "rgba(9,14,28,0.95)",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
      padding: "8px 6px",
      textAlign: "center",
      fontSize: 12,
      whiteSpace: "nowrap",
    },
    td: {
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "4px",
      verticalAlign: "middle",
    },
    kpi: {
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.02)",
      borderRadius: 12,
      padding: "8px 10px",
      minWidth: 150,
    },
    textarea: {
      width: "100%",
      minHeight: 300,
      resize: "vertical",
      background: "#0b1220",
      color: "#dbeafe",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 12,
      padding: "10px 12px",
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.45,
      outline: "none",
      boxSizing: "border-box",
    },
  };

  const statusBadge = useMemo(() => {
    if (saving) return { text: "Sauvegarde…", tone: "#fcd34d" };
    if (saveStatus === "saved") return { text: "Sauvegardé", tone: "#86efac" };
    if (saveStatus === "offline") return { text: "Local seulement", tone: "#fbbf24" };
    if (saveStatus === "error") return { text: "Erreur", tone: "#fca5a5" };
    return { text: "Prêt", tone: "#cbd5e1" };
  }, [saving, saveStatus]);

  const estimatedCost =
    analysisResult?.analysis?.costs?.totalEstimated ??
    analysisResult?.analysis?.summary?.estimatedPayrollCost ??
    analysisResult?.analysis?.summary?.estimatedCost ??
    0;

  const violationsCount = (analysisResult?.rules?.violations || []).length;
  const rulesWarningsCount = (analysisResult?.rules?.warnings || []).length;
  const analyzerWarningsCount = (analysisResult?.analysis?.warnings || []).length;
  const coverageGapsCount =
    analysisResult?.analysis?.summary?.coverageGapsCount ??
    analysisResult?.analysis?.summary?.coverageGapCount ??
    (analysisResult?.analysis?.coverageGaps || []).length;
  const skillGapsCount =
    analysisResult?.analysis?.summary?.skillCoverageGapsCount ||
    (analysisResult?.analysis?.coverageGaps || []).filter((g) => g.type === "coverage_skill_gap").length;
      return (
    <div style={ui.page} className="planning-rh-page">
      {/* Header */}
      <div style={ui.card} className="planning-print-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ minWidth: 280 }}>
            <h1 style={{ margin: 0, marginBottom: 4, fontSize: 22 }}>🗓️ Planning RH Drive</h1>
            <div style={{ opacity: 0.8, marginBottom: 4, fontSize: 13 }}>
              Site : <b>{normalizedSite || "—"}</b> • Semaine RH :{" "}
              <b>{formatWeekRangeLabel(weekStartMonday)}</b>
            </div>
            <div style={{ opacity: 0.72, fontSize: 12 }}>
              Affichage terrain : <b>Dimanche → Samedi</b> • Stockage semaine : <b>Lundi → Dimanche</b>
            </div>
            {adminState && (
              <div style={{ marginTop: 4, opacity: 0.75, fontSize: 11 }}>
                Rôle : <b>{adminState.loading ? "chargement..." : adminState.role || "—"}</b>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button style={ui.btn} onClick={() => setWeekStartMonday(addDays(weekStartMonday, -7))}>
                ⬅ Semaine -1
              </button>
              <button
                style={ui.btn}
                onClick={() => setWeekStartMonday(toISODate(getWeekStartMonday(new Date())))}
              >
                Aujourd’hui
              </button>
              <button style={ui.btn} onClick={() => setWeekStartMonday(addDays(weekStartMonday, 7))}>
                Semaine +1 ➡
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button style={ui.btn} onClick={goSetup}>⚙️ Setup</button>
              <button style={ui.btn} onClick={goCockpit}>🧭 Cockpit</button>
              <button style={ui.btn} onClick={duplicateWeekToNext}>📄 Copier +1</button>
              <button style={ui.btn} onClick={clearWeek}>🧹 Vider</button>
              <button style={ui.btn} onClick={handlePrint}>🖨️ Print</button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                style={ui.btnWarn}
                onClick={handleRunAutoBalance}
                disabled={autoBalanceRunning}
                title="Lance l’auto-équilibrage selon les utilitaires Sprint 3"
              >
                {autoBalanceRunning ? "⏳ Auto-balance..." : "⚖️ Auto-balance"}
              </button>

              <button
                style={ui.btn}
                onClick={() => setShowAnalysisPanel((v) => !v)}
                title="Afficher / masquer le panneau d’analyse"
              >
                {showAnalysisPanel ? "📉 Masquer analyse" : "📊 Afficher analyse"}
              </button>

              <button
                style={ui.btnSuccess}
                onClick={handleToggleConfigEditor}
                title="Afficher / masquer l’éditeur JSON doc.config"
              >
                {showConfigEditor ? "✖ Fermer doc.config" : "🧩 Éditer doc.config"}
              </button>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 12,
              }}
            >
              <span style={{ color: statusBadge.tone }}>●</span>
              <span>{statusBadge.text}</span>
            </div>
          </div>
        </div>

        {autoBalanceMessage ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: autoBalanceMessage.startsWith("Erreur") ? "#fca5a5" : "#86efac",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.02)",
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            {autoBalanceMessage}
          </div>
        ) : null}

        {saveError ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.25)",
              background: "rgba(251,191,36,0.08)",
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            ⚠️ {saveError}
          </div>
        ) : null}
      </div>

      {/* Éditeur doc.config JSON */}
      {showConfigEditor && (
        <div style={ui.card} className="planning-print-hide">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>🧩 Éditeur JSON — doc.config</h2>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Configure couverture, besoins par créneau, compétences et coûts pour l’analyse RH
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={ui.btn} onClick={handleFormatDocConfig}>✨ Formatter</button>
              <button style={ui.btn} onClick={handleCopyDocConfig}>📋 Copier</button>
              <button style={ui.btn} onClick={handleResetDocConfig}>♻️ Reset {"{}"}</button>
              <button style={ui.btnPrimary} onClick={handleApplyDocConfig}>💾 Appliquer doc.config</button>
            </div>
          </div>

          <textarea
            value={docConfigText}
            onChange={(e) => {
              setDocConfigText(e.target.value);
              setDocConfigDirty(true);
              setDocConfigSavedMsg("");
              setDocConfigError("");
            }}
            style={ui.textarea}
            spellCheck={false}
            placeholder={`{
  "coverageConfig": { "from": "06:00", "to": "21:30", "slotMinutes": 30 },
  "requirementsByDaySlot": {
    "mon": {
      "06:00-06:30": { "total": 2, "skills": { "drive": 1 } }
    }
  },
  "costing": {
    "defaultHourlyRate": 12.5,
    "hourlyRatesByRole": { "prep": 12.5, "coordo": 15.0 }
  }
}`}
          />

          {docConfigError ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#fecaca",
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.08)",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              ❌ {docConfigError}
            </div>
          ) : null}

          {docConfigSavedMsg ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#bbf7d0",
                border: "1px solid rgba(16,185,129,0.25)",
                background: "rgba(16,185,129,0.08)",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              ✅ {docConfigSavedMsg}
            </div>
          ) : null}

          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.72, lineHeight: 1.45 }}>
            Conseils :
            <br />• <code>coverageConfig</code> définit la plage analysée (ex. 06:00 → 21:30) et la taille des créneaux.
            <br />• <code>requirementsByDaySlot</code> porte les besoins par jour / créneau.
            <br />• <code>costing</code> permet d’estimer la masse salariale par rôle.
            <br />• Tu peux aussi ajouter <code>rhRules</code> (max amplitude, repos mini, etc.) pour les règles RH.
          </div>
        </div>
      )}

      {/* Analyse Sprint 3 PRO */}
      {showAnalysisPanel && (
        <div style={ui.card} className="planning-print-hide">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>📊 Analyse RH Sprint 3 PRO</h2>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Écarts contrat, règles RH, couverture (besoin vs planifié), compétences, coût estimé
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={ui.kpi}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Collaborateurs</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{(doc.rows || []).length}</div>
            </div>
            <div style={ui.kpi}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Heures planifiées (global)</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {minutesToHourLabel(analysisResult?.analysis?.summary?.totalPlannedMinutes || 0)}
              </div>
            </div>
            <div style={ui.kpi}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Δ global (contrats)</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {(() => {
                  const d = Number(analysisResult?.analysis?.summary?.totalDeltaMinutes || 0);
                  if (!d) return "OK";
                  return `${d > 0 ? "+" : "-"}${minutesToHourLabel(Math.abs(d))}`;
                })()}
              </div>
            </div>
            <div style={ui.kpi}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Violations RH</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{violationsCount}</div>
            </div>
            <div style={ui.kpi}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Gaps couverture</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {coverageGapsCount}
                {skillGapsCount ? (
                  <span style={{ opacity: 0.75, fontWeight: 600 }}> • skills {skillGapsCount}</span>
                ) : null}
              </div>
            </div>
            <div style={ui.kpi}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Coût estimé masse salariale</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{formatCurrencyEUR(estimatedCost)}</div>
            </div>
          </div>

          {/* mini synthèse couverture par jour */}
          {coverageByDayMini.some((d) => d.totalNeed > 0 || d.totalPlanned > 0 || d.totalGap > 0) && (
            <div
              style={{
                marginBottom: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                🧩 Besoin vs planifié (agrégé par jour)
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {coverageByDayMini.map((d) => {
                  const tone = d.totalGap > 0 ? "#fca5a5" : d.totalNeed > 0 ? "#86efac" : "#cbd5e1";

                  return (
                    <div
                      key={d.dayKey}
                      style={{
                        minWidth: 120,
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.015)",
                        padding: "8px 10px",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.dayKey.toUpperCase()}</div>
                      <div style={{ opacity: 0.8 }}>Planifié: {d.totalPlanned}</div>
                      <div style={{ opacity: 0.8 }}>Besoin: {d.totalNeed}</div>
                      <div style={{ color: tone, fontWeight: 700 }}>
                        Gap: {d.totalGap}
                        {d.skillGapsCount ? ` • skills ${d.skillGapsCount}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* top gaps */}
          {topCoverageGaps.length > 0 && (
            <div
              style={{
                marginBottom: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                🚨 Top gaps couverture / compétences
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {topCoverageGaps.map((g, i) => (
                  <div
                    key={`${g.type}-${g.dayKey}-${g.slotKey}-${g.skill || g.role || "total"}-${i}`}
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.015)",
                      padding: "6px 8px",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: g.severity === "high" ? "#fca5a5" : "#fcd34d" }}>● </span>
                    {g.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* alertes compactes */}
          {compactAlerts.length > 0 ? (
            <div style={{ display: "grid", gap: 6 }}>
              {compactAlerts.map((a, i) => {
                const tone =
                  a.level === "high"
                    ? "#fca5a5"
                    : a.level === "warning" || a.level === "medium"
                    ? "#fcd34d"
                    : "#93c5fd";

                return (
                  <div
                    key={`${a.text}-${i}`}
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: tone }}>●</span>
                    <span>{a.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Aucune alerte majeure détectée pour l’instant ✅
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
            Notes: les besoins/compétences/coûts s’activent automatiquement si <code>doc.config</code> est
            renseigné. Sans config, l’écran reste fonctionnel (fallback).
            {analyzerWarningsCount || rulesWarningsCount ? (
              <span>
                {" "}
                • Warnings: analyse {analyzerWarningsCount} / règles {rulesWarningsCount}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* Barre outils */}
      <div style={ui.card} className="planning-print-hide">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche collaborateur…"
              style={ui.input}
            />
          </div>

          <label
            style={{
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
              margin: 0,
              fontSize: 12,
            }}
          >
            <input
              type="checkbox"
              checked={showOnlyDiff}
              onChange={(e) => setShowOnlyDiff(e.target.checked)}
            />
            Voir seulement écarts contrat
          </label>

          <button style={ui.btnPrimary} onClick={addEmployeeRow}>
            ➕ Ajouter collaborateur
          </button>
        </div>

        {/* Quick shifts */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
            🎯 Affectation rapide sur la cellule sélectionnée
            {selectedRowId && selectedDayKey ? ` (${selectedDayKey.toUpperCase()})` : ""}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {QUICK_SHIFTS.map((s) => (
              <button
                key={`${s.label}-${s.value}`}
                style={ui.btn}
                onClick={() => applyQuickShiftToSelection(s.value)}
                title={`Appliquer ${s.value}`}
              >
                {s.label} · {s.value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI semaine (sur lignes affichées) */}
      <div style={ui.card} className="planning-print-summary">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            ["👥 Collaborateurs (affichés)", String(totals.staff)],
            ["⏱️ Heures planifiées", minutesToHourLabel(totals.totalPlanned)],
            ["🎯 Heures cibles", minutesToHourLabel(totals.totalTarget)],
            [
              "Δ Écart",
              `${totals.diff > 0 ? "+" : totals.diff < 0 ? "-" : ""}${minutesToHourLabel(
                Math.abs(totals.diff)
              )}${totals.diff < 0 ? " (sous)" : totals.diff > 0 ? " (sur)" : ""}`,
            ],
          ].map(([label, value]) => (
            <div key={label} style={ui.kpi}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{label}</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Grille planning */}
      <div style={{ ...ui.card, padding: 0 }} className="planning-grid-card">
        <div style={{ overflow: "auto", maxHeight: "70vh" }} className="planning-grid-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ ...ui.th, left: 0, zIndex: 3, textAlign: "left", minWidth: 150 }}>
                  Collaborateur
                </th>

                <th style={{ ...ui.th, minWidth: 70 }}>Contrat</th>

                {displayDayMeta.map((d) => (
                  <th key={d.key} style={{ ...ui.th, minWidth: 120 }}>
                    <div>{d.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.75 }}>{d.dateLabel}</div>
                  </th>
                ))}

                <th style={{ ...ui.th, minWidth: 80 }}>Heures</th>
                <th style={{ ...ui.th, minWidth: 80 }}>Écart</th>
                <th style={{ ...ui.th, minWidth: 140 }} className="planning-print-hide-col">Notes</th>
                <th style={{ ...ui.th, minWidth: 64 }} className="planning-print-hide-col">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} style={{ padding: 18, textAlign: "center", opacity: 0.8 }}>
                    Chargement du planning…
                  </td>
                </tr>
              ) : rowsWithStats.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ padding: 18, textAlign: "center", opacity: 0.8 }}>
                    Aucun collaborateur affiché. Ajoute une ligne ou vérifie les listes DriveOps.
                  </td>
                </tr>
              ) : (
                rowsWithStats.map((row) => {
                  const diffTone =
                    row.diffMin === 0 ? "#86efac" : row.diffMin > 0 ? "#fcd34d" : "#fca5a5";

                  return (
                    <tr key={row.id}>
                      {/* Nom */}
                      <td
                        style={{
                          ...ui.td,
                          position: "sticky",
                          left: 0,
                          background: "rgba(9,14,28,0.98)",
                          zIndex: 1,
                          minWidth: 150,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <input
                            style={{ ...ui.input, padding: "6px 8px", fontSize: 12 }}
                            value={row.name}
                            placeholder="Nom"
                            onChange={(e) =>
                              upsertRow(row.id, { name: normalizeName(e.target.value) })
                            }
                          />
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontSize: 10,
                                borderRadius: 999,
                                padding: "2px 7px",
                                border: "1px solid rgba(255,255,255,0.10)",
                                background: "rgba(255,255,255,0.03)",
                                opacity: 0.85,
                              }}
                            >
                              {row.role === "coordo" ? "🧭 Coordo" : "👷 Prépa"}
                            </span>
                            {Array.isArray(row.skills) && row.skills.length > 0 ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  borderRadius: 999,
                                  padding: "2px 7px",
                                  border: "1px solid rgba(59,130,246,0.20)",
                                  background: "rgba(59,130,246,0.10)",
                                  opacity: 0.95,
                                  maxWidth: 150,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={`Skills: ${row.skills.join(", ")}`}
                              >
                                🧠 {row.skills.join(", ")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* Contrat */}
                      <td style={ui.td}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          style={{ ...ui.input, textAlign: "center", padding: "6px 4px", fontSize: 12 }}
                          value={row.contractHours}
                          onChange={(e) =>
                            upsertRow(row.id, { contractHours: parseContractHours(e.target.value) })
                          }
                          title="Heures contrat / semaine"
                        />
                      </td>

                      {/* 7 jours (ordre UI dim->sam) */}
                      {DAY_KEYS_UI_ORDER.map((dayKey) => {
                        const value = row.cells?.[dayKey] || "";
                        const tone = getCellTone(value);
                        const printable = getPrintableCellParts(value);

                        let bg = "rgba(255,255,255,0.02)";
                        let border = "1px solid rgba(255,255,255,0.08)";
                        if (tone === "work") {
                          bg = "rgba(59,130,246,0.10)";
                          border = "1px solid rgba(59,130,246,0.24)";
                        } else if (tone === "rest") {
                          bg = "rgba(16,185,129,0.10)";
                          border = "1px solid rgba(16,185,129,0.22)";
                        } else if (tone === "cp") {
                          bg = "rgba(245,158,11,0.10)";
                          border = "1px solid rgba(245,158,11,0.22)";
                        } else if (tone === "alert") {
                          bg = "rgba(239,68,68,0.10)";
                          border = "1px solid rgba(239,68,68,0.22)";
                        }

                        const isSelected = selectedRowId === row.id && selectedDayKey === dayKey;

                        return (
                          <td key={`${row.id}-${dayKey}`} style={ui.td}>
                            <div className={`planning-cell-wrap tone-${tone}`}>
                              <input
                                className="planning-cell-input"
                                style={{
                                  ...ui.input,
                                  textAlign: "center",
                                  background: bg,
                                  border: isSelected
                                    ? "1px solid rgba(239,68,68,0.65)"
                                    : border,
                                  boxShadow: isSelected
                                    ? "0 0 0 2px rgba(239,68,68,0.16)"
                                    : "none",
                                  fontWeight: 700,
                                  padding: "6px 6px",
                                  fontSize: 12,
                                }}
                                value={value}
                                placeholder="06:00-13:30 / RH"
                                onFocus={() => {
                                  setSelectedRowId(row.id);
                                  setSelectedDayKey(dayKey);
                                }}
                                onChange={(e) => setCell(row.id, dayKey, e.target.value)}
                              />

                              <div
                                className={`planning-cell-print-preview kind-${printable.kind}`}
                                aria-hidden="true"
                              >
                                {printable.shift ? (
                                  <span className="planning-cell-slot">{printable.shift}</span>
                                ) : null}
                                {printable.badge ? (
                                  <span className="planning-cell-badge">{printable.badge}</span>
                                ) : null}
                                {!printable.shift && !printable.badge ? (
                                  <span className="planning-cell-empty">—</span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        );
                      })}

                      {/* Heures */}
                      <td style={ui.td}>
                        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 12 }}>
                          {minutesToHourLabel(row.weeklyMin)}
                        </div>
                      </td>

                      {/* Écart */}
                      <td style={ui.td}>
                        <div
                          style={{
                            textAlign: "center",
                            fontWeight: 800,
                            color: diffTone,
                            fontSize: 12,
                          }}
                        >
                          {row.diffMin === 0
                            ? "OK"
                            : `${row.diffMin > 0 ? "+" : "-"}${minutesToHourLabel(
                                Math.abs(row.diffMin)
                              )}`}
                        </div>
                      </td>

                      {/* Notes */}
                      <td style={ui.td} className="planning-print-hide-col">
                        <input
                          style={{ ...ui.input, padding: "6px 8px", fontSize: 12 }}
                          value={row.notes || ""}
                          placeholder="ex: indispo mardi soir | rate:13.2"
                          onChange={(e) => upsertRow(row.id, { notes: e.target.value })}
                        />
                      </td>

                      {/* Actions */}
                      <td style={ui.td} className="planning-print-hide-col">
                        <button
                          style={ui.btn}
                          onClick={() => removeEmployeeRow(row.id)}
                          title="Supprimer la ligne"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aide de saisie */}
      <div style={ui.card} className="planning-print-hide">
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 15 }}>💡 Aide de saisie</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
          <span style={pill("work")}>Shift : 06:00-13:30</span>
          <span style={pill("work")}>Shift + badge : 06:00-13:30/DRIVE</span>
          <span style={pill("rest")}>RH / OFF</span>
          <span style={pill("cp")}>CP</span>
          <span style={pill("alert")}>AT / MAL / ABS</span>
        </div>

        <div style={{ marginTop: 10, opacity: 0.8, fontSize: 12, lineHeight: 1.45 }}>
          • Les heures se calculent automatiquement à partir des formats <b>HH:MM-HH:MM</b>.<br />
          • Tu peux ajouter un badge suffixe (ex. <b>/DRIVE</b>, <b>/CAISSE</b>) pour l’affichage mural.<br />
          • Les codes RH / CP / OFF / AT / MAL / ABS ne comptent pas d’heures.<br />
          • Sélectionne une cellule puis utilise les boutons “Affectation rapide”.<br />
          • Le panneau Analyse Sprint 3 lit <b>doc.config</b> (couverture, besoins, coûts) si renseigné.<br />
          • L’auto-balance utilise aussi l’analyse de couverture pour prioriser les ajustements.
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        .planning-cell-print-preview {
          display: none;
        }

        .planning-cell-wrap {
          display: grid;
          gap: 4px;
        }

        .planning-cell-print-preview .planning-cell-slot {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 4px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          font-weight: 700;
          font-size: 10px;
          line-height: 1.1;
        }

        .planning-cell-print-preview .planning-cell-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 4px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          font-size: 9px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: .2px;
        }

        .planning-cell-print-preview.kind-work .planning-cell-slot {
          border-color: rgba(59,130,246,0.30);
          background: rgba(59,130,246,0.10);
        }
        .planning-cell-print-preview.kind-absence .planning-cell-badge {
          border-color: rgba(16,185,129,0.25);
          background: rgba(16,185,129,0.10);
        }
        .planning-cell-print-preview.kind-invalid .planning-cell-badge {
          border-color: rgba(239,68,68,0.25);
          background: rgba(239,68,68,0.10);
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }

          body {
            background: #fff !important;
          }

          .planning-rh-page {
            color: #111 !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 6px !important;
          }

          .planning-rh-page .planning-print-hide,
          .planning-rh-page .planning-print-hide-col {
            display: none !important;
          }

          .planning-rh-page .planning-print-header,
          .planning-rh-page .planning-print-summary,
          .planning-rh-page .planning-grid-card {
            box-shadow: none !important;
            background: #fff !important;
            border: 1px solid #ddd !important;
            border-radius: 8px !important;
            color: #111 !important;
            padding: 8px !important;
          }

          .planning-rh-page .planning-grid-scroll {
            max-height: none !important;
            overflow: visible !important;
          }

          .planning-rh-page table {
            min-width: 0 !important;
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }

          .planning-rh-page th,
          .planning-rh-page td {
            border: 1px solid #ddd !important;
            padding: 3px !important;
            font-size: 10px !important;
            color: #111 !important;
            background: #fff !important;
          }

          .planning-rh-page th {
            position: static !important;
            top: auto !important;
            z-index: auto !important;
          }

          .planning-rh-page td[style*="position: sticky"],
          .planning-rh-page th[style*="left: 0"] {
            position: static !important;
            left: auto !important;
            z-index: auto !important;
            background: #fff !important;
          }

          .planning-rh-page .planning-cell-input {
            display: none !important;
          }

          .planning-rh-page td input:not(.planning-cell-input) {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            color: #111 !important;
            padding: 0 !important;
            font-size: 10px !important;
          }

          .planning-rh-page td input::placeholder {
            color: transparent !important;
          }

          .planning-rh-page .planning-cell-print-preview {
            display: flex !important;
            flex-direction: column !important;
            gap: 2px !important;
            align-items: stretch !important;
            justify-content: center !important;
            min-height: 24px !important;
          }

          .planning-rh-page .planning-cell-print-preview .planning-cell-slot {
            display: inline-flex !important;
            justify-content: center !important;
            border: 1px solid #bbb !important;
            background: #f5f5f5 !important;
            color: #111 !important;
            border-radius: 4px !important;
            padding: 1px 2px !important;
            font-size: 9px !important;
            font-weight: 700 !important;
            line-height: 1.1 !important;
          }

          .planning-rh-page .planning-cell-print-preview .planning-cell-badge {
            display: inline-flex !important;
            justify-content: center !important;
            border: 1px solid #aaa !important;
            background: #fff !important;
            color: #111 !important;
            border-radius: 999px !important;
            padding: 1px 3px !important;
            font-size: 8px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
          }

          .planning-rh-page .planning-cell-empty {
            text-align: center !important;
            opacity: 0.45 !important;
            font-size: 9px !important;
          }

          .planning-rh-page button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// ---------- mini helpers UI
function pill(type) {
  let bg = "rgba(255,255,255,0.04)";
  let border = "1px solid rgba(255,255,255,0.10)";
  if (type === "work") {
    bg = "rgba(59,130,246,0.12)";
    border = "1px solid rgba(59,130,246,0.25)";
  }
  if (type === "rest") {
    bg = "rgba(16,185,129,0.12)";
    border = "1px solid rgba(16,185,129,0.25)";
  }
  if (type === "cp") {
    bg = "rgba(245,158,11,0.12)";
    border = "1px solid rgba(245,158,11,0.25)";
  }
  if (type === "alert") {
    bg = "rgba(239,68,68,0.12)";
    border = "1px solid rgba(239,68,68,0.25)";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    background: bg,
    border,
  };
}