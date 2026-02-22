// src/pages/PlanningRH.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

import { buildPlanningRecommendations } from "../utils/planningAnalyzer";
import {
  DEFAULT_COVERAGE_BLOCKS,
  DAY_KEYS_UI_ORDER,
  severityTone,
  dayLabel,
} from "../utils/planningRules";
import {
  buildAutoBalanceSuggestions,
  applyAutoBalanceMoves,
} from "../utils/planningAutoBalance";

/* =========================================================
   PlanningRH v2 + Sprint 3 (DriveOps)
   - Semaine RH (stockage = lundi)
   - Affichage grille = Dimanche -> Samedi (terrain)
   - Supabase-ready + fallback localStorage
   - Recommandations (écarts contrat + couverture)
   - Auto-balance suggestions (preview + apply v1)
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

function parseShiftToMinutes(cell) {
  const raw = String(cell || "").trim().toUpperCase();
  if (!raw) return 0;
  if (isAbsenceCode(raw)) return 0;

  // accepte "06:00-13:30" ou "06h00-13h30" ou "06:00-13:30 / RH"
  const normalized = raw.replaceAll("H", ":").replace(/\s+/g, "");
  const rich = normalized.match(
    /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\/([A-Z0-9_-]+))?$/
  );
  if (!rich) return 0;

  const start = hhmmToMin(rich[1]);
  const end = hhmmToMin(rich[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  const code = String(rich[3] || "").toUpperCase();
  if (code && isAbsenceCode(code)) return 0; // "06:00-13:30 / RH" => 0h

  let diff = end - start;
  if (diff < 0) diff += 24 * 60; // sécurité nuit
  return Math.max(0, diff);
}

function minutesToHourLabel(min) {
  const n = Number(min) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${pad2(m)}`;
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
  const v = String(value || "").trim().toUpperCase();
  if (!v) return "empty";
  if (v === "RH" || v === "OFF") return "rest";
  if (v === "CP") return "cp";
  if (v === "AT" || v === "MAL" || v === "ABS") return "alert";
  if (parseShiftToMinutes(v) > 0) return "work";
  // cas "06:00-13:30 / RH"
  if (v.includes("-") && v.includes("/")) return "rest";
  return "unknown";
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
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    name: normalizeName(name),
    contractHours: parseContractHours(contractHours),
    role: "prep", // prep | coordo | autre (extension future)
    cells: makeEmptyCells(),
    notes: "",
  };
}

function makePlanningDoc({ siteCode, weekStartMonday, rows = [] }) {
  return {
    siteCode,
    weekStartMonday,
    rows,
    updatedAt: new Date().toISOString(),
    version: 2,
  };
}

// ---------- storage keys
function localKey(siteCode, weekStartMonday) {
  return `${LS_PREFIX}__${String(siteCode || "").toLowerCase()}__${weekStartMonday}`;
}

// ---------- Supabase (fallback local si table absente)
async function loadPlanningRemote(siteCode, weekStartMonday) {
  // Table recommandée: drive_rh_plannings(site_code text, week_start date, data_json jsonb, updated_at timestamptz)
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

function getPrintStylesV2() {
  return `
@page { size: A4 landscape; margin: 8mm; }

@media print {
  html, body {
    background: #fff !important;
    color: #000 !important;
  }

  body * {
    visibility: hidden !important;
  }

  #planning-print-root,
  #planning-print-root * {
    visibility: visible !important;
  }

  #planning-print-root {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    font-family: Arial, Helvetica, sans-serif !important;
  }

  .no-print { display: none !important; }

  .print-shell {
    padding: 6mm;
  }

  .print-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 6px;
    font-size: 11px;
  }

  .print-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 2px 0;
    color: #000 !important;
  }

  .print-sub {
    font-size: 10px;
    color: #333 !important;
    line-height: 1.25;
  }

  .print-kpis {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .print-kpi {
    border: 1px solid #bbb;
    border-radius: 6px;
    padding: 4px 6px;
    min-width: 88px;
    font-size: 10px;
    background: #fff;
  }
  .print-kpi .label { color: #444; }
  .print-kpi .value { font-weight: 700; margin-top: 2px; }

  .print-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 9px;
  }

  .print-table th,
  .print-table td {
    border: 1px solid #999 !important;
    padding: 3px 4px !important;
    color: #000 !important;
    vertical-align: middle;
    background: #fff !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .print-table thead th {
    background: #f2f2f2 !important;
    font-weight: 700;
    text-align: center;
  }

  .print-col-name { width: 16%; text-align: left !important; }
  .print-col-contract { width: 6%; }
  .print-col-day { width: 9.2%; }
  .print-col-hours { width: 7%; }
  .print-col-delta { width: 7%; }
  .print-col-notes { width: 9.6%; }

  .print-row-coordo td:first-child {
    font-weight: 700;
  }

  .print-badge {
    display: inline-block;
    border: 1px solid #aaa;
    border-radius: 999px;
    padding: 0 5px;
    font-size: 8px;
    margin-left: 4px;
  }

  .print-cell-work { background: #f7fbff !important; }
  .print-cell-rest { background: #f7fff9 !important; }
  .print-cell-cp { background: #fffaf2 !important; }
  .print-cell-alert { background: #fff6f6 !important; }

  .print-footer {
    margin-top: 4px;
    font-size: 9px;
    color: #444;
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
}
`;
}

export default function PlanningRH({ adminState }) {
  const siteCode = useDriveStore((s) => s.siteCode);
  const preparateursList = useDriveStore((s) => s.preparateursList || []);
  const coordosList = useDriveStore((s) => s.coordosList || []);

  const screen = useDriveStore((s) => s.screen);
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

  // Sprint 3 options UI
  const [showIntel, setShowIntel] = useState(true);
  const [showAutoBalance, setShowAutoBalance] = useState(true);
  const [intelMaxItems, setIntelMaxItems] = useState(12);

  const normalizedSite = useMemo(
    () => String(siteCode || "").trim().toLowerCase(),
    [siteCode]
  );

  const displayWeekDates = useMemo(
    () => getDisplayWeekDatesFromMonday(weekStartMonday),
    [weekStartMonday]
  );

  // map clé jour -> label date (ordre UI)
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
        // fallback local si table n'existe pas encore / RLS pas prêt
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
          }))
        : [];

      setDoc(loaded);
      setSaveStatus("idle");
    } finally {
      setLoading(false);
    }
  }, [normalizedSite, weekStartMonday]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

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
    }

    setAutoAddFromDriveOpsDone(true);
  }, [loading, autoAddFromDriveOpsDone, doc?.rows, preparateursList, coordosList]);

  // reset auto-merge flag when week changes
  useEffect(() => {
    setAutoAddFromDriveOpsDone(false);
  }, [weekStartMonday, normalizedSite]);

  // ---------- autosave (local immédiat + remote debounce)
  useEffect(() => {
    if (!doc || !normalizedSite || !weekStartMonday) return;

    // local backup
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
      } finally {
        setSaving(false);
      }
    }, 450);

    return () => clearTimeout(t);
  }, [doc, normalizedSite, weekStartMonday]);

  // ---------- mutations
  const upsertRow = useCallback((rowId, patch) => {
    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
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
  }, []);

  const addEmployeeRow = useCallback(() => {
    const row = makeRow("", 35);
    setDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      rows: [...prev.rows, row],
    }));
    setSelectedRowId(row.id);
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

  const moveRow = useCallback((rowId, dir) => {
    setDoc((prev) => {
      const idx = prev.rows.findIndex((r) => r.id === rowId);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.rows.length) return prev;

      const rows = [...prev.rows];
      const [item] = rows.splice(idx, 1);
      rows.splice(nextIdx, 0, item);

      return { ...prev, rows, updatedAt: new Date().toISOString() };
    });
  }, []);

  const handlePrintV2 = useCallback(() => {
    const existing = document.getElementById("planning-print-style-v2");
    if (!existing) {
      const style = document.createElement("style");
      style.id = "planning-print-style-v2";
      style.innerHTML = getPrintStylesV2();
      document.head.appendChild(style);
    }
    window.print();
  }, []);

  // ---------- vues calculées (grille)
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

  // ---------- Sprint 3 intelligence (branché sur les 3 utilitaires)
  const planningRules = useMemo(
    () => ({
      contractToleranceMinutes: 15,
      coverageBlocks: DEFAULT_COVERAGE_BLOCKS,
    }),
    []
  );

  const planningIntel = useMemo(() => {
    return buildPlanningRecommendations(doc.rows || [], {
      rules: planningRules,
      maxItems: intelMaxItems,
    });
  }, [doc.rows, planningRules, intelMaxItems]);

  const autoBalanceIntel = useMemo(() => {
    return buildAutoBalanceSuggestions(doc.rows || [], {
      rules: planningRules,
      maxMoves: 10,
    });
  }, [doc.rows, planningRules]);

  const applyAutoBalanceV1 = useCallback(() => {
    const moves = autoBalanceIntel?.moves || [];
    const applicable = moves.filter((m) => m.type === "add-shift-on-empty-day");
    if (applicable.length === 0) {
      alert("Aucune suggestion auto-balance applicable (v1) pour le moment.");
      return;
    }

    const ok = window.confirm(
      `Appliquer ${applicable.length} suggestion(s) auto-balance v1 dans la grille ?`
    );
    if (!ok) return;

    setDoc((prev) => ({
      ...prev,
      rows: applyAutoBalanceMoves(prev.rows || [], applicable),
      updatedAt: new Date().toISOString(),
    }));
  }, [autoBalanceIntel]);

  // ---------- style inline minimal (cohérent Cockpit)
  const ui = {
    page: {
      maxWidth: 1440,
      margin: "24px auto",
      padding: "0 16px",
      color: "#e8eefc",
      display: "flex",
      flexDirection: "column",
      gap: 16,
    },
    card: {
      border: "1px solid rgba(255,255,255,0.10)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
      borderRadius: 16,
      padding: 14,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      overflow: "hidden",
    },
    btn: {
      background: "rgba(255,255,255,0.03)",
      color: "#f3f4f6",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "9px 12px",
      cursor: "pointer",
      fontWeight: 600,
      whiteSpace: "nowrap",
    },
    btnPrimary: {
      background: "linear-gradient(180deg, #ef4444, #dc2626)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "9px 12px",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 8px 18px rgba(220,38,38,0.25)",
      whiteSpace: "nowrap",
    },
    btnGreen: {
      background: "linear-gradient(180deg, #10b981, #059669)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "9px 12px",
      cursor: "pointer",
      fontWeight: 700,
      whiteSpace: "nowrap",
      boxShadow: "0 8px 18px rgba(16,185,129,0.20)",
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
      padding: "10px 8px",
      textAlign: "center",
      fontSize: 13,
      whiteSpace: "nowrap",
    },
    td: {
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "6px",
      verticalAlign: "middle",
    },
  };

  const statusBadge = useMemo(() => {
    if (saving) return { text: "Sauvegarde…", tone: "#fcd34d" };
    if (saveStatus === "saved") return { text: "Sauvegardé", tone: "#86efac" };
    if (saveStatus === "offline") return { text: "Local seulement", tone: "#fbbf24" };
    if (saveStatus === "error") return { text: "Erreur", tone: "#fca5a5" };
    return { text: "Prêt", tone: "#cbd5e1" };
  }, [saving, saveStatus]);

  const coverageSummary = useMemo(() => {
    const recs = planningIntel?.recommendations || [];
    const gaps = recs.filter((r) => r.type === "coverage-gap").length;
    const contractUnder = recs.filter((r) => r.type === "contract-under").length;
    const contractOver = recs.filter((r) => r.type === "contract-over").length;
    return { gaps, contractUnder, contractOver };
  }, [planningIntel]);

  return (
    <div style={ui.page} id="planning-print-root">
      {/* Header */}
      <div style={ui.card} className="no-print">
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
            <h1 style={{ margin: 0, marginBottom: 6 }}>🗓️ Planning RH Drive</h1>
            <div style={{ opacity: 0.8, marginBottom: 6 }}>
              Site : <b>{normalizedSite || "—"}</b> • Semaine RH :{" "}
              <b>{formatWeekRangeLabel(weekStartMonday)}</b>
            </div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>
              Affichage terrain : <b>Dimanche → Samedi</b> • Stockage semaine :{" "}
              <b>Lundi → Dimanche</b>
            </div>
            {adminState && (
              <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>
                Rôle : <b>{adminState.loading ? "chargement..." : adminState.role || "—"}</b>
              </div>
            )}
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}
          >
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
              <button style={ui.btn} onClick={goSetup}>
                ⚙️ Setup
              </button>
              <button style={ui.btn} onClick={goCockpit}>
                🧭 Cockpit
              </button>
              <button style={ui.btn} onClick={duplicateWeekToNext}>
                📄 Copier semaine +1
              </button>
              <button style={ui.btn} onClick={clearWeek}>
                🧹 Vider semaine
              </button>
              <button style={ui.btnPrimary} onClick={handlePrintV2}>
                🖨️ Imprimer
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

        {saveError ? (
          <div
            style={{
              marginTop: 10,
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

      {/* Barre outils */}
      <div style={ui.card} className="no-print">
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
        <div style={{ marginTop: 12 }}>
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

      {/* KPI semaine */}
      <div style={ui.card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            ["👥 Collaborateurs", String(totals.staff)],
            ["⏱️ Heures planifiées", minutesToHourLabel(totals.totalPlanned)],
            ["🎯 Heures cibles", minutesToHourLabel(totals.totalTarget)],
            [
              "Δ Écart",
              `${totals.diff > 0 ? "+" : totals.diff < 0 ? "-" : ""}${minutesToHourLabel(
                Math.abs(totals.diff)
              )}${totals.diff < 0 ? " (sous)" : totals.diff > 0 ? " (sur)" : ""}`,
            ],
            ["🚨 Trous couverture", String(coverageSummary.gaps)],
            ["📉 Sous-contrat", String(coverageSummary.contractUnder)],
            ["📈 Sur-contrat", String(coverageSummary.contractOver)],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 12,
                padding: "10px 12px",
                minWidth: 160,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sprint 3 - Recommandations */}
      <div style={ui.card} className="no-print">
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
            <h2 style={{ margin: 0, fontSize: 16 }}>🧠 Recommandations (Sprint 3)</h2>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
              Basé sur écarts contrat + couverture par créneaux (règles v1)
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, opacity: 0.85 }}>
              Max items{" "}
              <input
                type="number"
                min={1}
                max={30}
                value={intelMaxItems}
                onChange={(e) => setIntelMaxItems(Math.max(1, Number(e.target.value) || 12))}
                style={{
                  ...ui.input,
                  width: 70,
                  display: "inline-block",
                  marginLeft: 6,
                  padding: "6px 8px",
                  textAlign: "center",
                }}
              />
            </label>

            <button style={ui.btn} onClick={() => setShowIntel((v) => !v)}>
              {showIntel ? "Masquer" : "Afficher"}
            </button>
          </div>
        </div>

        {showIntel && (
          <>
            {(planningIntel?.recommendations || []).length === 0 ? (
              <div
                style={{
                  border: "1px solid rgba(16,185,129,0.20)",
                  background: "rgba(16,185,129,0.06)",
                  color: "#a7f3d0",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              >
                ✅ Aucune alerte prioritaire détectée sur les règles actuelles.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {planningIntel.recommendations.map((rec, idx) => {
                  const tone = severityTone(rec.severity);
                  return (
                    <div
                      key={`${rec.type}-${rec.title}-${idx}`}
                      style={{
                        border: tone.border,
                        background: tone.bg,
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, color: tone.color }}>{rec.title}</div>
                          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
                            {rec.detail}
                          </div>
                          {rec.action ? (
                            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                              👉 {rec.action}
                            </div>
                          ) : null}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            borderRadius: 999,
                            padding: "4px 8px",
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.03)",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {rec.severity || "low"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Sprint 3 - Auto-balance preview */}
      <div style={ui.card} className="no-print">
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
            <h2 style={{ margin: 0, fontSize: 16 }}>⚖️ Auto-balance (preview v1)</h2>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
              Suggestions non appliquées automatiquement (tu gardes la main)
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={ui.btn} onClick={() => setShowAutoBalance((v) => !v)}>
              {showAutoBalance ? "Masquer" : "Afficher"}
            </button>
            <button style={ui.btnGreen} onClick={applyAutoBalanceV1}>
              ✅ Appliquer suggestions v1
            </button>
          </div>
        </div>

        {showAutoBalance && (
          <>
            {(autoBalanceIntel?.moves || []).length === 0 ? (
              <div
                style={{
                  border: "1px solid rgba(59,130,246,0.20)",
                  background: "rgba(59,130,246,0.06)",
                  color: "#bfdbfe",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              >
                ℹ️ Aucune suggestion v1 générée (pas de case vide pertinente ou pas de trou de couverture).
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {autoBalanceIntel.moves.map((m, idx) => {
                  const tone = severityTone(m.severity || "low");
                  return (
                    <div
                      key={`${m.type}-${m.rowId || "x"}-${idx}`}
                      style={{
                        border: tone.border,
                        background: tone.bg,
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: tone.color }}>
                        {m.type === "add-shift-on-empty-day"
                          ? `Ajouter ${m.shiftValue} à ${m.staffName} (${m.dayLabel})`
                          : `Ajustement suggéré pour ${m.staffName || "collaborateur"}`}
                      </div>

                      <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
                        {m.reason || m.actionHint || "Suggestion auto-balance"}
                      </div>

                      {m.type === "add-shift-on-empty-day" ? (
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                          + Gain estimé : {minutesToHourLabel(m.estimatedGainMinutes || 0)} • Jour :{" "}
                          <b>{m.dayLabel}</b> • Créneau : <b>{m.shiftLabel}</b>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                marginTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 10,
                fontSize: 12,
                opacity: 0.8,
              }}
            >
              Preview :{" "}
              <b>{(autoBalanceIntel?.baseIntel?.recommendations || []).length}</b> reco avant →
              <b> {(autoBalanceIntel?.previewIntel?.recommendations || []).length}</b> reco après
              simulation (v1)
            </div>
          </>
        )}
      </div>

      {/* Grille planning */}
      <div style={{ ...ui.card, padding: 0 }}>
        <div style={{ overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1320 }}>
            <thead>
              <tr>
                <th style={{ ...ui.th, left: 0, zIndex: 3, textAlign: "left", minWidth: 190 }}>
                  Collaborateur
                </th>

                <th style={{ ...ui.th, minWidth: 90 }}>Contrat</th>

                {displayDayMeta.map((d) => (
                  <th key={d.key} style={{ ...ui.th, minWidth: 145 }}>
                    <div>{d.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>{d.dateLabel}</div>
                  </th>
                ))}

                <th style={{ ...ui.th, minWidth: 110 }}>Heures</th>
                <th style={{ ...ui.th, minWidth: 110 }}>Écart</th>
                <th style={{ ...ui.th, minWidth: 180 }}>Notes</th>
                <th style={{ ...ui.th, minWidth: 100 }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} style={{ padding: 18, textAlign: "center", opacity: 0.8 }}>
                    Chargement du planning…
                  </td>
                </tr>
              ) : rowsWithStats.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ padding: 18, textAlign: "center", opacity: 0.8 }}>
                    Aucun collaborateur affiché. Ajoute une ligne ou vérifie les listes DriveOps.
                  </td>
                </tr>
              ) : (
                rowsWithStats.map((row, rowIdx) => {
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
                          minWidth: 190,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            style={ui.input}
                            value={row.name}
                            placeholder="Nom"
                            onChange={(e) =>
                              upsertRow(row.id, { name: normalizeName(e.target.value) })
                            }
                          />
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                borderRadius: 999,
                                padding: "3px 8px",
                                border: "1px solid rgba(255,255,255,0.10)",
                                background: "rgba(255,255,255,0.03)",
                                opacity: 0.9,
                              }}
                            >
                              {row.role === "coordo" ? "🧭 Coordo" : "👷 Prépa"}
                            </span>

                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                type="button"
                                style={{ ...ui.btn, padding: "4px 7px", fontSize: 12 }}
                                onClick={() => moveRow(row.id, -1)}
                                title="Monter"
                                disabled={rowIdx === 0}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                style={{ ...ui.btn, padding: "4px 7px", fontSize: 12 }}
                                onClick={() => moveRow(row.id, 1)}
                                title="Descendre"
                                disabled={rowIdx === rowsWithStats.length - 1}
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contrat */}
                      <td style={ui.td}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          style={{ ...ui.input, textAlign: "center" }}
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
                            <input
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
                              }}
                              value={value}
                              placeholder="06:00-13:30 / RH"
                              onFocus={() => {
                                setSelectedRowId(row.id);
                                setSelectedDayKey(dayKey);
                              }}
                              onChange={(e) => setCell(row.id, dayKey, e.target.value)}
                            />
                          </td>
                        );
                      })}

                      {/* Heures */}
                      <td style={ui.td}>
                        <div style={{ textAlign: "center", fontWeight: 800 }}>
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
                      <td style={ui.td}>
                        <input
                          style={ui.input}
                          value={row.notes || ""}
                          placeholder="ex: indispo mardi soir"
                          onChange={(e) => upsertRow(row.id, { notes: e.target.value })}
                        />
                      </td>

                      {/* Actions */}
                      <td style={ui.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            style={ui.btn}
                            onClick={() => removeEmployeeRow(row.id)}
                            title="Supprimer la ligne"
                          >
                            🗑️
                          </button>
                        </div>
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
      <div style={ui.card} className="no-print">
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>💡 Aide de saisie</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
          <span style={pill("work")}>Shift : 06:00-13:30</span>
          <span style={pill("work")}>Shift + code : 06:00-13:30 / RH</span>
          <span style={pill("rest")}>RH / OFF</span>
          <span style={pill("cp")}>CP</span>
          <span style={pill("alert")}>AT / MAL / ABS</span>
        </div>

        <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13, lineHeight: 1.45 }}>
          • Les heures se calculent automatiquement à partir des formats <b>HH:MM-HH:MM</b>.<br />
          • Les codes RH / CP / OFF / AT / MAL / ABS ne comptent pas d’heures.<br />
          • Si tu mets <b>06:00-13:30 / RH</b>, le créneau est affiché mais compté à <b>0h</b> (utile
          pour affichage mural / info RH).<br />• Sélectionne une cellule puis utilise les boutons
          “Affectation rapide”.<br />• Les recommandations Sprint 3 sont des aides : tu restes maître
          du planning.
        </div>
      </div>

      {/* Impression v2 : version dédiée (visible seulement au print) */}
      <div
        className="print-shell"
        style={{ display: "none" }} // affiché par CSS print
      >
        <div className="print-header">
          <div>
            <div className="print-title">Planning RH Drive</div>
            <div className="print-sub">
              Site : <b>{normalizedSite || "—"}</b> • Semaine RH :{" "}
              <b>{formatWeekRangeLabel(weekStartMonday)}</b>
              <br />
              Affichage terrain : Dimanche → Samedi • Généré le{" "}
              {new Date().toLocaleString("fr-FR")}
            </div>
          </div>

          <div className="print-kpis">
            <div className="print-kpi">
              <div className="label">Staff</div>
              <div className="value">{totals.staff}</div>
            </div>
            <div className="print-kpi">
              <div className="label">Planifié</div>
              <div className="value">{minutesToHourLabel(totals.totalPlanned)}</div>
            </div>
            <div className="print-kpi">
              <div className="label">Cible</div>
              <div className="value">{minutesToHourLabel(totals.totalTarget)}</div>
            </div>
            <div className="print-kpi">
              <div className="label">Δ</div>
              <div className="value">
                {totals.diff > 0 ? "+" : totals.diff < 0 ? "-" : ""}
                {minutesToHourLabel(Math.abs(totals.diff))}
              </div>
            </div>
          </div>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th className="print-col-name">Collaborateur</th>
              <th className="print-col-contract">Contrat</th>

              {displayDayMeta.map((d) => (
                <th key={`p-${d.key}`} className="print-col-day">
                  <div>{d.label}</div>
                  <div style={{ fontSize: 9, color: "#444" }}>{d.dateLabel}</div>
                </th>
              ))}

              <th className="print-col-hours">Heures</th>
              <th className="print-col-delta">Écart</th>
              <th className="print-col-notes">Notes</th>
            </tr>
          </thead>

          <tbody>
            {rowsWithStats.map((row) => (
              <tr key={`print-${row.id}`} className={row.role === "coordo" ? "print-row-coordo" : ""}>
                <td>
                  {row.name || "—"}
                  <span className="print-badge">{row.role === "coordo" ? "Coordo" : "Prépa"}</span>
                </td>
                <td style={{ textAlign: "center" }}>{row.contractHours}h</td>

                {DAY_KEYS_UI_ORDER.map((dayKey) => {
                  const val = row.cells?.[dayKey] || "";
                  const tone = getCellTone(val);

                  let cls = "";
                  if (tone === "work") cls = "print-cell-work";
                  if (tone === "rest") cls = "print-cell-rest";
                  if (tone === "cp") cls = "print-cell-cp";
                  if (tone === "alert") cls = "print-cell-alert";

                  return (
                    <td key={`print-${row.id}-${dayKey}`} className={cls} style={{ textAlign: "center" }}>
                      {val || "—"}
                    </td>
                  );
                })}

                <td style={{ textAlign: "center", fontWeight: 700 }}>
                  {minutesToHourLabel(row.weeklyMin)}
                </td>
                <td style={{ textAlign: "center", fontWeight: 700 }}>
                  {row.diffMin === 0
                    ? "OK"
                    : `${row.diffMin > 0 ? "+" : "-"}${minutesToHourLabel(Math.abs(row.diffMin))}`}
                </td>
                <td>{row.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-footer">
          <div>
            Règles Sprint 3 (v1) : tolérance contrat 15 min • couverture par blocs par défaut
          </div>
          <div>
            Recos visibles à l’écran : {(planningIntel?.recommendations || []).length}
          </div>
        </div>
      </div>
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