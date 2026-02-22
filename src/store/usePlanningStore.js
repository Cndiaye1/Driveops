// src/store/usePlanningStore.js
import { create } from "zustand";
import { supabase } from "../services/supabaseClient";
import {
  buildWeekDatesFromMonday,
  entryToHours,
  getMondayISO,
  makeEmptyWeekMatrix,
  parseCellInput,
} from "../utils/planning";

function upper(v) {
  return String(v || "").trim().toUpperCase();
}

function prettifyError(e) {
  const msg = String(e?.message || e || "");
  const lower = msg.toLowerCase();
  if (lower.includes("row-level security")) return "Accès refusé (RLS).";
  if (lower.includes("network") || lower.includes("fetch")) return "Connexion réseau instable.";
  return msg || "Erreur inconnue";
}

export const usePlanningStore = create((set, get) => ({
  // context
  siteCode: "",
  weekStart: getMondayISO(), // lundi ISO

  // data
  weekMeta: null, // {id, site_code, week_start, status, title...}
  staff: [], // from drive_staff_contracts
  entries: [], // flat rows
  matrix: {}, // { STAFF: {0: entry|null, ...6} }

  // ui
  loading: false,
  saving: false,
  error: "",
  success: "",
  selectedCell: null, // {staffName, dayIndex}

  // dirty tracking
  dirtyCells: {}, // key = `${staff}|${day}` => raw input string
  cellErrors: {}, // key => error string

  // ---------- setters context
  setSiteCode: (siteCode) =>
    set({ siteCode: String(siteCode || "").trim().toLowerCase() }),

  setWeekStart: (weekStart) =>
    set({ weekStart: String(weekStart || "").slice(0, 10) }),

  setSelectedCell: (staffName, dayIndex) =>
    set({
      selectedCell:
        staffName == null || dayIndex == null
          ? null
          : { staffName: upper(staffName), dayIndex: Number(dayIndex) },
    }),

  clearFeedback: () => set({ error: "", success: "" }),

  // --------------------------
  // STAFF (référentiel RH)
  loadStaffContracts: async () => {
    const { siteCode } = get();
    if (!siteCode) return;

    try {
      const { data, error } = await supabase
        .from("drive_staff_contracts")
        .select("*")
        .eq("site_code", siteCode)
        .eq("is_active", true)
        .order("staff_name", { ascending: true });

      if (error) throw error;

      set({ staff: data || [] });
    } catch (e) {
      set({ error: prettifyError(e) });
    }
  },

  upsertStaffContract: async ({
    staff_name,
    contract_hours = 35,
    color_tag = null,
    team_label = null,
  }) => {
    const { siteCode } = get();
    const name = upper(staff_name);
    if (!siteCode || !name) return;

    try {
      set({ saving: true, error: "", success: "" });

      const payload = {
        site_code: siteCode,
        staff_name: name,
        contract_hours: Number(contract_hours) || 0,
        color_tag: color_tag || null,
        team_label: team_label || null,
        is_active: true,
      };

      const { error } = await supabase
        .from("drive_staff_contracts")
        .upsert(payload, { onConflict: "site_code,staff_name" });

      if (error) throw error;

      await get().loadStaffContracts();
      set({ success: `Collaborateur ${name} enregistré.`, saving: false });
    } catch (e) {
      set({ error: prettifyError(e), saving: false });
    }
  },

  // --------------------------
  // WEEK + ENTRIES
  ensureWeekRow: async () => {
    const { siteCode, weekStart } = get();
    if (!siteCode || !weekStart) return null;

    // try existing
    const { data: existing, error: e1 } = await supabase
      .from("drive_planning_weeks")
      .select("*")
      .eq("site_code", siteCode)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (e1) throw e1;
    if (existing) {
      set({ weekMeta: existing });
      return existing;
    }

    // create
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id || null;

    const payload = {
      site_code: siteCode,
      week_start: weekStart,
      title: null,
      status: "draft",
      created_by: uid,
      updated_by: uid,
    };

    const { data: created, error: e2 } = await supabase
      .from("drive_planning_weeks")
      .insert(payload)
      .select("*")
      .single();

    if (e2) throw e2;

    set({ weekMeta: created });
    return created;
  },

  loadWeek: async () => {
    const { siteCode, weekStart } = get();
    if (!siteCode || !weekStart) return;

    try {
      set({ loading: true, error: "", success: "" });

      await get().loadStaffContracts();
      const week = await get().ensureWeekRow();

      if (!week?.id) {
        throw new Error("Impossible de charger/créer la semaine RH.");
      }

      const { data: rows, error } = await supabase
        .from("drive_planning_entries")
        .select("*")
        .eq("site_code", siteCode)
        .eq("week_id", week.id)
        .order("staff_name", { ascending: true })
        .order("day_index", { ascending: true });

      if (error) throw error;

      const staff = get().staff || [];
      const matrix = makeEmptyWeekMatrix(staff);

      (rows || []).forEach((r) => {
        const name = upper(r.staff_name);
        if (!matrix[name]) {
          matrix[name] = {};
          for (let d = 0; d < 7; d++) matrix[name][d] = null;
        }
        matrix[name][r.day_index] = r;
      });

      set({
        entries: rows || [],
        matrix,
        dirtyCells: {},
        cellErrors: {},
        loading: false,
      });
    } catch (e) {
      set({ error: prettifyError(e), loading: false });
    }
  },

  // Local edit (cell text)
  setCellInput: (staffName, dayIndex, rawInput) => {
    const name = upper(staffName);
    const key = `${name}|${dayIndex}`;
    const parsed = parseCellInput(rawInput);

    set((s) => {
      const dirtyCells = { ...(s.dirtyCells || {}), [key]: String(rawInput ?? "") };
      const cellErrors = { ...(s.cellErrors || {}) };

      if (parsed.kind === "invalid") cellErrors[key] = parsed.error || "Format invalide";
      else delete cellErrors[key];

      return { dirtyCells, cellErrors, success: "", error: "" };
    });
  },

  // Save one cell
  saveCell: async (staffName, dayIndex) => {
    const st = get();
    const name = upper(staffName);
    const d = Number(dayIndex);
    const key = `${name}|${d}`;
    const raw = st.dirtyCells?.[key];

    if (raw == null) return;
    const parsed = parseCellInput(raw);

    if (parsed.kind === "invalid") {
      set((s) => ({
        cellErrors: { ...(s.cellErrors || {}), [key]: parsed.error || "Format invalide" },
      }));
      return;
    }

    try {
      set({ saving: true, error: "", success: "" });

      const week = st.weekMeta || (await get().ensureWeekRow());
      if (!week?.id) throw new Error("Semaine RH introuvable.");

      // empty => delete entry if exists
      const existing = st.matrix?.[name]?.[d] || null;

      if (parsed.kind === "empty") {
        if (existing?.id) {
          const { error } = await supabase
            .from("drive_planning_entries")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else {
        const payload = {
          week_id: week.id,
          site_code: st.siteCode,
          staff_name: name,
          day_index: d,
          entry_type: parsed.entry_type,
          start_time: parsed.start_time,
          end_time: parsed.end_time,
          break_minutes: parsed.break_minutes ?? 0,
          label: parsed.label ?? null,
          color_tag: null,
          comment: null,
        };

        const { error } = await supabase
          .from("drive_planning_entries")
          .upsert(payload, { onConflict: "week_id,staff_name,day_index" });

        if (error) throw error;
      }

      await get().loadWeek();

      set((s) => {
        const dirtyCells = { ...(s.dirtyCells || {}) };
        const cellErrors = { ...(s.cellErrors || {}) };
        delete dirtyCells[key];
        delete cellErrors[key];
        return {
          dirtyCells,
          cellErrors,
          saving: false,
          success: `Cellule ${name} / ${d} enregistrée.`,
        };
      });
    } catch (e) {
      set({ error: prettifyError(e), saving: false });
    }
  },

  saveAllDirty: async () => {
    const { dirtyCells } = get();
    const keys = Object.keys(dirtyCells || {});
    for (const key of keys) {
      const [staffName, d] = key.split("|");
      // eslint-disable-next-line no-await-in-loop
      await get().saveCell(staffName, Number(d));
    }
    set({ success: "Planning enregistré." });
  },

  duplicateFromPreviousWeek: async () => {
    const st = get();
    const siteCode = st.siteCode;
    const currentMonday = new Date(`${st.weekStart}T00:00:00`);
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(prevMonday.getDate() - 7);

    // ⚠️ locale-safe (évite bug UTC)
    const y = prevMonday.getFullYear();
    const m = String(prevMonday.getMonth() + 1).padStart(2, "0");
    const d = String(prevMonday.getDate()).padStart(2, "0");
    const prevISO = `${y}-${m}-${d}`;

    if (!siteCode) return;

    try {
      set({ loading: true, error: "", success: "" });

      const week = st.weekMeta || (await get().ensureWeekRow());

      const { data: prevWeek, error: ePrevWeek } = await supabase
        .from("drive_planning_weeks")
        .select("*")
        .eq("site_code", siteCode)
        .eq("week_start", prevISO)
        .maybeSingle();
      if (ePrevWeek) throw ePrevWeek;
      if (!prevWeek) {
        set({ loading: false, error: "Aucun planning trouvé la semaine précédente." });
        return;
      }

      const { data: prevEntries, error: ePrevEntries } = await supabase
        .from("drive_planning_entries")
        .select("*")
        .eq("site_code", siteCode)
        .eq("week_id", prevWeek.id);

      if (ePrevEntries) throw ePrevEntries;

      // on remplace les entrées de la semaine courante
      const { error: eDelete } = await supabase
        .from("drive_planning_entries")
        .delete()
        .eq("site_code", siteCode)
        .eq("week_id", week.id);
      if (eDelete) throw eDelete;

      const inserts = (prevEntries || []).map((r) => ({
        week_id: week.id,
        site_code: siteCode,
        staff_name: upper(r.staff_name),
        day_index: r.day_index,
        entry_type: r.entry_type,
        start_time: r.start_time,
        end_time: r.end_time,
        break_minutes: r.break_minutes ?? 0,
        label: r.label ?? null,
        color_tag: r.color_tag ?? null,
        comment: r.comment ?? null,
      }));

      if (inserts.length > 0) {
        const { error: eInsert } = await supabase
          .from("drive_planning_entries")
          .insert(inserts);
        if (eInsert) throw eInsert;
      }

      await get().loadWeek();
      set({ loading: false, success: "Planning dupliqué depuis la semaine précédente." });
    } catch (e) {
      set({ loading: false, error: prettifyError(e) });
    }
  },

  // --------------------------
  // Derived selectors (methods)
  getWeekDates: () => buildWeekDatesFromMonday(get().weekStart),

  getCellEntry: (staffName, dayIndex) => {
    const name = upper(staffName);
    return get().matrix?.[name]?.[Number(dayIndex)] || null;
  },

  getCellDisplay: (staffName, dayIndex) => {
    const name = upper(staffName);
    const d = Number(dayIndex);
    const key = `${name}|${d}`;
    const dirty = get().dirtyCells?.[key];
    if (dirty != null) return dirty;

    const e = get().matrix?.[name]?.[d] || null;
    if (!e) return "";
    if (e.entry_type && e.entry_type !== "shift") return e.entry_type;

    const base = `${e.start_time || ""}-${e.end_time || ""}`;
    const br = Number(e.break_minutes) || 0;
    return br > 0 ? `${base} /${br}` : base;
  },

  getRowStats: (staffName) => {
    const name = upper(staffName);
    const row = get().staff.find((s) => upper(s.staff_name) === name);
    const contract = Number(row?.contract_hours) || 0;

    let planned = 0;
    let restDays = 0;
    let cpDays = 0;

    for (let d = 0; d < 7; d++) {
      const e = get().matrix?.[name]?.[d];
      if (!e) continue;
      if (e.entry_type === "RH" || e.entry_type === "OFF") restDays += 1;
      if (e.entry_type === "CP") cpDays += 1;
      planned += entryToHours(e);
    }

    planned = Math.round(planned * 100) / 100;
    const delta = Math.round((planned - contract) * 100) / 100;

    return { contract, planned, delta, restDays, cpDays };
  },
}));