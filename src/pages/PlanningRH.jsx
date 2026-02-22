import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../services/supabaseClient";
import { useDriveStore } from "../store/useDriveStore";

/* =========================================================
   PlanningRH v1 (DriveOps) + PRINT 1
   - Semaine RH (stockage = lundi)
   - Affichage grille = Dimanche -> Samedi (terrain)
   - Supabase-ready + fallback localStorage
   - Impression A4 paysage (version compacte / murale)
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

function parseShiftToMinutes(cell) {
  const raw = String(cell || "").trim().toUpperCase();
  if (!raw) return 0;
  if (isAbsenceCode(raw)) return 0;

  // accepte "06:00-13:30" ou "06h00-13h30"
  const normalized = raw.replaceAll("H", ":").replace(/\s+/g, "");
  const m = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return 0;

  const start = hhmmToMin(m[1]);
  const end = hhmmToMin(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  let diff = end - start;
  if (diff < 0) diff += 24 * 60; // sécurité nuit
  return Math.max(0, diff);
}

function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function minutesToHourLabel(min) {
  const h = Math.floor((Number(min) || 0) / 60);
  const m = (Number(min) || 0) % 60;
  return m ? `${h}h${pad2(m)}` : `${h}h`;
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
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
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
    version: 1,
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

  const printGeneratedAt = useMemo(() => {
    return new Date().toLocaleString("fr-FR");
  }, [doc.updatedAt, weekStartMonday]);

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

      loaded.rows = Array.isArray(loaded.rows)
        ? loaded.rows.map((r) => ({
            id: r.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
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

  // ---------- auto-ajout collaborateurs depuis DriveOps
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

  useEffect(() => {
    setAutoAddFromDriveOpsDone(false);
  }, [weekStartMonday, normalizedSite]);

  // ---------- autosave
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
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
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

  const handlePrint = useCallback(() => {
    try {
      window.print();
    } catch (e) {
      console.error(e);
    }
  }, []);

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

  // ---------- styles
  const ui = {
    page: {
      maxWidth: 1440,
      margin: "20px auto",
      padding: "0 14px",
      color: "#e8eefc",
      display: "flex",
      flexDirection: "column",
      gap: 14,
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
    btnPrint: {
      background: "linear-gradient(180deg, #2563eb, #1d4ed8)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "9px 12px",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 8px 18px rgba(37,99,235,0.25)",
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
      padding: "5px",
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

  return (
    <div style={ui.page} className="planning-rh-page">
      {/* PRINT CSS (local au composant) */}
      <style>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }

        @media print {
          html, body {
            background: #fff !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body * {
            visibility: hidden;
          }

          .planning-rh-page, .planning-rh-page * {
            visibility: visible;
          }

          .planning-rh-page {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 6px !important;
            color: #000 !important;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .planning-print-card {
            border: 1px solid #d1d5db !important;
            background: #fff !important;
            box-shadow: none !important;
            border-radius: 6px !important;
            padding: 6px 8px !important;
            overflow: visible !important;
          }

          .planning-table-wrap {
            overflow: visible !important;
            max-height: none !important;
          }

          .planning-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 10px !important;
          }

          .planning-table thead th {
            position: static !important;
            top: auto !important;
            z-index: auto !important;
            background: #f3f4f6 !important;
            color: #000 !important;
            border: 1px solid #d1d5db !important;
            padding: 4px 3px !important;
            font-size: 9px !important;
            line-height: 1.15 !important;
          }

          .planning-table td {
            border: 1px solid #e5e7eb !important;
            padding: 2px !important;
            background: #fff !important;
            color: #000 !important;
            vertical-align: middle !important;
          }

          .planning-sticky-col {
            position: static !important;
            left: auto !important;
            z-index: auto !important;
            background: #fff !important;
          }

          .planning-input,
          .planning-cell-input {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            color: #000 !important;
            padding: 1px 2px !important;
            border-radius: 0 !important;
            font-size: 10px !important;
            line-height: 1.1 !important;
            text-align: center !important;
            width: 100% !important;
          }

          .planning-name-input {
            text-align: left !important;
            font-weight: 700 !important;
          }

          .planning-notes-input {
            text-align: left !important;
            font-size: 9px !important;
          }

          .planning-role-chip {
            display: none !important;
          }

          .planning-actions-col,
          .planning-actions-cell {
            display: none !important;
          }

          .planning-kpi-grid {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 6px !important;
          }

          .planning-kpi-item {
            min-width: 0 !important;
            border-radius: 6px !important;
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            background: #fff !important;
            padding: 5px 6px !important;
          }

          .planning-kpi-item .kpi-label {
            font-size: 9px !important;
            opacity: 1 !important;
            color: #374151 !important;
          }

          .planning-kpi-item .kpi-value {
            font-size: 11px !important;
            font-weight: 800 !important;
            margin-top: 2px !important;
            color: #000 !important;
          }

          .planning-print-compact-header {
            display: grid !important;
            grid-template-columns: 1.4fr 1fr 1fr;
            gap: 8px;
            align-items: start;
            margin-bottom: 4px;
            font-size: 10px;
            color: #111827;
          }

          .planning-print-compact-header h1 {
            font-size: 14px !important;
            margin: 0 0 2px 0 !important;
            line-height: 1.1 !important;
          }

          .planning-print-compact-header .muted {
            color: #4b5563 !important;
            font-size: 9px !important;
          }

          .planning-print-footnote {
            display: block !important;
            margin-top: 4px !important;
            font-size: 8px !important;
            color: #4b5563 !important;
            text-align: right !important;
          }

          .planning-cell-work { background: rgba(59,130,246,0.08) !important; }
          .planning-cell-rest { background: rgba(16,185,129,0.08) !important; }
          .planning-cell-cp { background: rgba(245,158,11,0.08) !important; }
          .planning-cell-alert { background: rgba(239,68,68,0.08) !important; }

          .planning-col-name { width: 16% !important; }
          .planning-col-contract { width: 5.5% !important; }
          .planning-col-day { width: 9.2% !important; }
          .planning-col-hours { width: 6.5% !important; }
          .planning-col-delta { width: 6% !important; }
          .planning-col-notes { width: 9.5% !important; }
        }

        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* Header écran */}
      <div style={ui.card} className="planning-print-card">
        {/* Header impression compact */}
        <div className="print-only planning-print-compact-header">
          <div>
            <h1>Planning RH Drive</h1>
            <div><b>Site :</b> {normalizedSite || "—"}</div>
            <div><b>Semaine RH :</b> {formatWeekRangeLabel(weekStartMonday)}</div>
          </div>
          <div className="muted">
            <div><b>Affichage :</b> Dimanche → Samedi</div>
            <div><b>Stockage :</b> Lundi → Dimanche</div>
            <div><b>Collaborateurs :</b> {rowsWithStats.length}</div>
          </div>
          <div className="muted" style={{ textAlign: "right" }}>
            <div><b>Édité :</b> {printGeneratedAt}</div>
            {adminState ? (
              <div><b>Rôle :</b> {adminState.loading ? "chargement..." : adminState.role || "—"}</div>
            ) : null}
          </div>
        </div>

        <div
          className="no-print"
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
              <button style={ui.btnPrint} onClick={handlePrint} title="Impression A4 paysage">
                🖨️ Imprimer A4
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
            className="no-print"
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

      {/* Barre outils (écran seulement) */}
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
      <div style={ui.card} className="planning-print-card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }} className="planning-kpi-grid">
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
          ].map(([label, value]) => (
            <div
              key={label}
              className="planning-kpi-item"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 12,
                padding: "10px 12px",
                minWidth: 180,
              }}
            >
              <div className="kpi-label" style={{ fontSize: 12, opacity: 0.75 }}>
                {label}
              </div>
              <div className="kpi-value" style={{ fontWeight: 800, marginTop: 4 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grille planning */}
      <div style={{ ...ui.card, padding: 0 }} className="planning-print-card">
        <div style={{ overflow: "auto", maxHeight: "70vh" }} className="planning-table-wrap">
          <table className="planning-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1160 }}>
            <thead>
              <tr>
                <th
                  className="planning-col-name"
                  style={{ ...ui.th, left: 0, zIndex: 3, textAlign: "left", minWidth: 170 }}
                >
                  Collaborateur
                </th>

                <th className="planning-col-contract" style={{ ...ui.th, minWidth: 80 }}>
                  Contrat
                </th>

                {displayDayMeta.map((d) => (
                  <th key={d.key} className="planning-col-day" style={{ ...ui.th, minWidth: 125 }}>
                    <div>{d.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.75 }}>{d.dateLabel}</div>
                  </th>
                ))}

                <th className="planning-col-hours" style={{ ...ui.th, minWidth: 95 }}>
                  Heures
                </th>
                <th className="planning-col-delta" style={{ ...ui.th, minWidth: 95 }}>
                  Écart
                </th>
                <th className="planning-col-notes" style={{ ...ui.th, minWidth: 160 }}>
                  Notes
                </th>
                <th className="planning-actions-col no-print" style={{ ...ui.th, minWidth: 70 }}>
                  Action
                </th>
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
                        className="planning-sticky-col"
                        style={{
                          ...ui.td,
                          position: "sticky",
                          left: 0,
                          background: "rgba(9,14,28,0.98)",
                          zIndex: 1,
                          minWidth: 170,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <input
                            className="planning-input planning-name-input"
                            style={{ ...ui.input, padding: "7px 9px" }}
                            value={row.name}
                            placeholder="Nom"
                            onChange={(e) =>
                              upsertRow(row.id, { name: normalizeName(e.target.value) })
                            }
                          />
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span
                              className="planning-role-chip"
                              style={{
                                fontSize: 11,
                                borderRadius: 999,
                                padding: "3px 8px",
                                border: "1px solid rgba(255,255,255,0.10)",
                                background: "rgba(255,255,255,0.03)",
                                opacity: 0.8,
                              }}
                            >
                              {row.role === "coordo" ? "🧭 Coordo" : "👷 Prépa"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contrat */}
                      <td style={ui.td}>
                        <input
                          className="planning-input"
                          type="number"
                          min="0"
                          step="0.5"
                          style={{ ...ui.input, textAlign: "center", padding: "7px 8px" }}
                          value={row.contractHours}
                          onChange={(e) =>
                            upsertRow(row.id, { contractHours: parseContractHours(e.target.value) })
                          }
                          title="Heures contrat / semaine"
                        />
                      </td>

                      {/* 7 jours */}
                      {DAY_KEYS_UI_ORDER.map((dayKey) => {
                        const value = row.cells?.[dayKey] || "";
                        const tone = getCellTone(value);

                        let bg = "rgba(255,255,255,0.02)";
                        let border = "1px solid rgba(255,255,255,0.08)";
                        let toneClass = "";

                        if (tone === "work") {
                          bg = "rgba(59,130,246,0.10)";
                          border = "1px solid rgba(59,130,246,0.24)";
                          toneClass = "planning-cell-work";
                        } else if (tone === "rest") {
                          bg = "rgba(16,185,129,0.10)";
                          border = "1px solid rgba(16,185,129,0.22)";
                          toneClass = "planning-cell-rest";
                        } else if (tone === "cp") {
                          bg = "rgba(245,158,11,0.10)";
                          border = "1px solid rgba(245,158,11,0.22)";
                          toneClass = "planning-cell-cp";
                        } else if (tone === "alert") {
                          bg = "rgba(239,68,68,0.10)";
                          border = "1px solid rgba(239,68,68,0.22)";
                          toneClass = "planning-cell-alert";
                        }

                        const isSelected = selectedRowId === row.id && selectedDayKey === dayKey;

                        return (
                          <td key={`${row.id}-${dayKey}`} style={ui.td} className={toneClass}>
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
                                padding: "7px 6px",
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
                          className="planning-input planning-notes-input"
                          style={{ ...ui.input, padding: "7px 8px" }}
                          value={row.notes || ""}
                          placeholder="ex: indispo mardi soir"
                          onChange={(e) => upsertRow(row.id, { notes: e.target.value })}
                        />
                      </td>

                      {/* Actions */}
                      <td className="planning-actions-cell no-print" style={ui.td}>
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

        <div className="print-only planning-print-footnote">
          Planning RH DriveOps • Impression A4 paysage • Généré le {printGeneratedAt}
        </div>
      </div>

      {/* Aide de saisie (écran seulement) */}
      <div style={ui.card} className="no-print">
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>💡 Aide de saisie</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
          <span style={pill("work")}>Shift : 06:00-13:30</span>
          <span style={pill("rest")}>RH / OFF</span>
          <span style={pill("cp")}>CP</span>
          <span style={pill("alert")}>AT / MAL / ABS</span>
        </div>

        <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13, lineHeight: 1.45 }}>
          • Les heures se calculent automatiquement à partir des formats <b>HH:MM-HH:MM</b>.<br />
          • Les codes RH / CP / OFF / AT / MAL ne comptent pas d’heures.<br />
          • Sélectionne une cellule puis utilise les boutons “Affectation rapide”.<br />
          • Pour une impression murale propre : utilise le bouton <b>🖨️ Imprimer A4</b>.
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