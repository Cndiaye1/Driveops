// src/utils/planningAutoBalance.js

import {
  DEFAULT_SHIFT_LIBRARY,
  parseCellValue,
  buildShiftCellValue,
  getContractTargetMinutes,
  getCellWorkedMinutes,
  RH_CODES,
} from "./planning";
import {
  evaluateRowAgainstRules,
  canAssignShiftOnDay,
  canReplaceShiftOnDay,
} from "./planningRules";
import {
  computePlanningAnalysis,
  getCoverageGapsByDay,
} from "./planningAnalyzer";

/**
 * =========================================================
 * Auto-balance RH (Sprint 3)
 * ---------------------------------------------------------
 * Idée:
 * 1) Identifier les collaborateurs sous-planifiés
 * 2) Identifier les jours en sous-couverture (coverage gaps)
 * 3) Essayer en priorité :
 *    - de déplacer un shift d'une journée "sur-couverte" vers un gap
 *    - sinon d'ajouter un shift sur une case vide compatible
 * 4) Générer un plan d'actions + aperçu du planning simulé
 *
 * NOTE:
 * - Ce module NE modifie pas l'UI directement.
 * - Il renvoie des "propositions" et/ou un "draftRows" simulé.
 * - L'UI (PlanningRH.jsx) décide d'appliquer / prévisualiser / confirmer.
 * =========================================================
 */

/* -------------------------------------------------------
 * Helpers
 * ----------------------------------------------------- */

function upper(v) {
  return String(v || "").trim().toUpperCase();
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getDayKeysFromOptions(options = {}) {
  // ordre logique lundi -> dimanche
  return Array.isArray(options.dayKeys) && options.dayKeys.length === 7
    ? options.dayKeys
    : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
}

function getShiftLibrary(options = {}) {
  return Array.isArray(options.shiftLibrary) && options.shiftLibrary.length
    ? options.shiftLibrary
    : DEFAULT_SHIFT_LIBRARY;
}

function getMinCoverageByDay(options = {}) {
  // ex: { mon: 4, tue: 4, ... } ou nombre fixe
  const dayKeys = getDayKeysFromOptions(options);
  const raw = options.minCoverageByDay;

  if (typeof raw === "number") {
    const out = {};
    for (const d of dayKeys) out[d] = Math.max(0, Math.floor(raw));
    return out;
  }

  if (raw && typeof raw === "object") {
    const out = {};
    for (const d of dayKeys) out[d] = Math.max(0, Math.floor(Number(raw[d]) || 0));
    return out;
  }

  // défaut prudent
  const out = {};
  for (const d of dayKeys) out[d] = 0;
  return out;
}

function getRowName(row) {
  return upper(row?.name || row?.staff_name || "");
}

function getRowContractHours(row) {
  const n = Number(row?.contractHours ?? row?.contract_hours);
  return Number.isFinite(n) ? Math.max(0, n) : 35;
}

/**
 * Compat rows:
 * - format PlanningRH: row.cells[dayKey] = "06:00-13:30" / "RH"
 * - format futur: row.days[dayKey] = ...
 */
function getRowDayValue(row, dayKey) {
  if (row?.cells && Object.prototype.hasOwnProperty.call(row.cells, dayKey)) return row.cells[dayKey];
  if (row?.days && Object.prototype.hasOwnProperty.call(row.days, dayKey)) return row.days[dayKey];
  return "";
}

function setRowDayValue(row, dayKey, value) {
  if (row?.cells) {
    row.cells[dayKey] = value;
    return;
  }
  if (row?.days) {
    row.days[dayKey] = value;
    return;
  }
  // fallback
  row.cells = row.cells || {};
  row.cells[dayKey] = value;
}

function isCellEmpty(value) {
  return !String(value || "").trim();
}

function isWorkedShiftCell(value) {
  return getCellWorkedMinutes(value) > 0;
}

function isNonWorkedCode(value) {
  const p = parseCellValue(value);
  return p.type === "code" && RH_CODES.includes(p.code);
}

function getWorkedMinutesForRow(row, dayKeys) {
  return dayKeys.reduce((sum, d) => sum + getCellWorkedMinutes(getRowDayValue(row, d)), 0);
}

function makeShiftCellFromLib(shift) {
  return buildShiftCellValue(shift.start, shift.end);
}

function shiftToCellString(shift) {
  return buildShiftCellValue(shift.start, shift.end);
}

/**
 * Score simplifié pour prioriser les shifts à poser sur un gap:
 * - favorise shift long
 * - favorise libellés "Matin/Journée/Fermeture" si présents
 */
function scoreShiftForGap(shift) {
  const label = String(shift?.label || "").toLowerCase();
  let score = 0;
  const duration = Math.max(0, Number(shift?.durationMinutes || 0));
  score += duration;

  if (label.includes("journ")) score += 30;
  if (label.includes("matin")) score += 20;
  if (label.includes("ferm")) score += 20;

  return score;
}

function enrichShiftLibrary(shiftLibrary) {
  return (shiftLibrary || []).map((s) => ({
    ...s,
    durationMinutes:
      typeof s.durationMinutes === "number"
        ? s.durationMinutes
        : getCellWorkedMinutes(shiftToCellString(s)),
  }));
}

/* -------------------------------------------------------
 * Coverage computation (simple)
 * ----------------------------------------------------- */

/**
 * Compte le nombre de personnes "travaillant" par jour
 * (toute cellule avec shift > 0 min)
 */
function computeWorkedHeadcountByDay(rows, dayKeys) {
  const out = {};
  for (const d of dayKeys) out[d] = 0;

  for (const row of rows || []) {
    for (const d of dayKeys) {
      const v = getRowDayValue(row, d);
      if (isWorkedShiftCell(v)) out[d] += 1;
    }
  }
  return out;
}

function computeCoverageGaps(rows, options = {}) {
  const dayKeys = getDayKeysFromOptions(options);
  const minCoverageByDay = getMinCoverageByDay(options);
  const workedCountByDay = computeWorkedHeadcountByDay(rows, dayKeys);

  const gaps = {};
  for (const d of dayKeys) {
    const min = Number(minCoverageByDay[d] || 0);
    const cur = Number(workedCountByDay[d] || 0);
    gaps[d] = Math.max(0, min - cur);
  }

  return {
    minCoverageByDay,
    workedCountByDay,
    gaps,
  };
}

/* -------------------------------------------------------
 * Candidate selection
 * ----------------------------------------------------- */

function buildStaffBalanceRows(rows, options = {}) {
  const dayKeys = getDayKeysFromOptions(options);

  return (rows || []).map((row, index) => {
    const workedMinutes = getWorkedMinutesForRow(row, dayKeys);
    const contractHours = getRowContractHours(row);
    const targetMinutes = getContractTargetMinutes(contractHours);
    const deltaMinutes = workedMinutes - targetMinutes; // negatif = sous-planifié

    return {
      rowIndex: index,
      rowId: row?.id ?? null,
      name: getRowName(row),
      contractHours,
      targetMinutes,
      workedMinutes,
      deltaMinutes,
      underMinutes: Math.max(0, -deltaMinutes),
      overMinutes: Math.max(0, deltaMinutes),
      row,
    };
  });
}

function sortUnderPlannedFirst(staffBalances) {
  return [...staffBalances].sort((a, b) => {
    if (b.underMinutes !== a.underMinutes) return b.underMinutes - a.underMinutes;
    return a.name.localeCompare(b.name, "fr");
  });
}

/* -------------------------------------------------------
 * Rule wrappers
 * ----------------------------------------------------- */

function checkCanAddShift({ rows, row, dayKey, shift, options }) {
  // Si la cellule n'est pas vide, on n'ajoute pas
  const current = getRowDayValue(row, dayKey);
  if (!isCellEmpty(current)) {
    return { ok: false, reason: "Cellule non vide" };
  }

  // Règles métier
  if (typeof canAssignShiftOnDay === "function") {
    const res = canAssignShiftOnDay({
      row,
      rows,
      dayKey,
      shift,
      options,
    });
    if (res && res.ok === false) return res;
  }

  return { ok: true };
}

function checkCanMoveShift({
  rows,
  row,
  fromDayKey,
  toDayKey,
  toShift,
  options,
}) {
  const fromVal = getRowDayValue(row, fromDayKey);
  if (!isWorkedShiftCell(fromVal)) {
    return { ok: false, reason: "Pas de shift travaillé à déplacer" };
  }

  const toVal = getRowDayValue(row, toDayKey);
  if (!isCellEmpty(toVal)) {
    return { ok: false, reason: "Jour cible non vide" };
  }

  if (typeof canReplaceShiftOnDay === "function") {
    // compat: on utilise canReplaceShiftOnDay si dispo
    const res = canReplaceShiftOnDay({
      row,
      rows,
      fromDayKey,
      toDayKey,
      nextShift: toShift,
      options,
    });
    if (res && res.ok === false) return res;
  } else if (typeof canAssignShiftOnDay === "function") {
    // fallback: on teste juste l'ajout sur le jour cible
    const res = canAssignShiftOnDay({
      row,
      rows,
      dayKey: toDayKey,
      shift: toShift,
      options,
    });
    if (res && res.ok === false) return res;
  }

  return { ok: true };
}

/* -------------------------------------------------------
 * Apply simulation actions
 * ----------------------------------------------------- */

function applyAddShift(rows, { rowIndex, dayKey, shift }) {
  const next = clone(rows);
  const row = next[rowIndex];
  if (!row) return next;

  setRowDayValue(row, dayKey, makeShiftCellFromLib(shift));
  return next;
}

function applyMoveShift(rows, { rowIndex, fromDayKey, toDayKey, shift }) {
  const next = clone(rows);
  const row = next[rowIndex];
  if (!row) return next;

  // enlève le shift source (on met RH par défaut ? non => vide pour rester neutre)
  setRowDayValue(row, fromDayKey, "");
  setRowDayValue(row, toDayKey, makeShiftCellFromLib(shift));

  return next;
}

/* -------------------------------------------------------
 * Main engine
 * ----------------------------------------------------- */

/**
 * @param {Object} args
 * @param {Array}  args.rows - rows du planning (format PlanningRH)
 * @param {Object} args.options
 * @param {Array}  [args.options.dayKeys]
 * @param {Array}  [args.options.shiftLibrary]
 * @param {Object|number} [args.options.minCoverageByDay]
 * @param {number} [args.options.maxActions=10]
 * @param {boolean} [args.options.preferMove=true]
 * @param {boolean} [args.options.allowAdd=true]
 * @param {boolean} [args.options.allowMove=true]
 *
 * @returns {{
 *   ok: boolean,
 *   draftRows: Array,
 *   actions: Array,
 *   before: Object,
 *   after: Object,
 *   logs: string[]
 * }}
 */
export function autoBalancePlanning({ rows = [], options = {} } = {}) {
  const dayKeys = getDayKeysFromOptions(options);
  const shiftLibrary = enrichShiftLibrary(getShiftLibrary(options)).sort(
    (a, b) => scoreShiftForGap(b) - scoreShiftForGap(a)
  );

  const maxActions = Math.max(1, Number(options.maxActions) || 10);
  const preferMove = options.preferMove !== false;
  const allowAdd = options.allowAdd !== false;
  const allowMove = options.allowMove !== false;

  let draftRows = clone(rows);
  const actions = [];
  const logs = [];

  const beforeCoverage = computeCoverageGaps(draftRows, { ...options, dayKeys });
  const beforeStaffBalances = buildStaffBalanceRows(draftRows, { ...options, dayKeys });

  for (let step = 0; step < maxActions; step++) {
    const coverage = computeCoverageGaps(draftRows, { ...options, dayKeys });
    const gapsByDay = coverage.gaps;

    // jours avec gap > 0, triés du + gros gap au + petit
    const gapDays = dayKeys
      .map((d) => ({ dayKey: d, gap: Number(gapsByDay[d] || 0) }))
      .filter((x) => x.gap > 0)
      .sort((a, b) => b.gap - a.gap);

    if (gapDays.length === 0) {
      logs.push("✅ Plus de gap de couverture détecté.");
      break;
    }

    const staffBalances = sortUnderPlannedFirst(
      buildStaffBalanceRows(draftRows, { ...options, dayKeys }).filter((x) => x.underMinutes > 0)
    );

    if (staffBalances.length === 0) {
      logs.push("ℹ️ Aucun collaborateur sous-planifié restant.");
      break;
    }

    let actionDone = false;

    // on tente de combler chaque gap
    for (const gapDay of gapDays) {
      const toDayKey = gapDay.dayKey;

      // priorités: collaborateurs les plus sous-planifiés
      for (const sb of staffBalances) {
        const row = sb.row;

        // -----------------------------
        // 1) MOVE intelligent
        // -----------------------------
        if (preferMove && allowMove) {
          // Cherche un shift déplaçable depuis un jour sans gap (ou moins critique)
          const candidateFromDays = dayKeys
            .filter((d) => d !== toDayKey)
            .map((d) => {
              const val = getRowDayValue(row, d);
              const worked = isWorkedShiftCell(val);
              const dayGap = Number(gapsByDay[d] || 0);
              return { fromDayKey: d, worked, dayGap, val };
            })
            .filter((x) => x.worked)
            // on préfère déplacer depuis jours sans gap
            .sort((a, b) => a.dayGap - b.dayGap);

          for (const from of candidateFromDays) {
            const parsedFrom = parseCellValue(from.val);

            // shift cible = on reprend d'abord le même créneau si valide
            const moveShiftCandidate =
              shiftLibrary.find(
                (s) => s.start === parsedFrom.start && s.end === parsedFrom.end
              ) || {
                id: "MOVED_SHIFT",
                label: "Shift déplacé",
                start: parsedFrom.start,
                end: parsedFrom.end,
                durationMinutes: parsedFrom.workedMinutes || parsedFrom.minutes || 0,
              };

            const canMove = checkCanMoveShift({
              rows: draftRows,
              row,
              fromDayKey: from.fromDayKey,
              toDayKey,
              toShift: moveShiftCandidate,
              options: { ...options, dayKeys },
            });

            // éviter de creuser un gap si le jour source est déjà en gap
            const sourceGap = Number(gapsByDay[from.fromDayKey] || 0);
            if (sourceGap > 0) continue;

            if (canMove.ok) {
              draftRows = applyMoveShift(draftRows, {
                rowIndex: sb.rowIndex,
                fromDayKey: from.fromDayKey,
                toDayKey,
                shift: moveShiftCandidate,
              });

              actions.push({
                type: "move-shift",
                rowIndex: sb.rowIndex,
                rowId: sb.rowId,
                staffName: sb.name,
                fromDayKey: from.fromDayKey,
                toDayKey,
                shift: {
                  start: moveShiftCandidate.start,
                  end: moveShiftCandidate.end,
                  label: moveShiftCandidate.label || "",
                },
                reason: "Combler un gap de couverture + réduire sous-planification",
              });

              logs.push(
                `↔️ ${sb.name}: déplacement ${from.fromDayKey} → ${toDayKey} (${moveShiftCandidate.start}-${moveShiftCandidate.end})`
              );

              actionDone = true;
              break;
            }
          }

          if (actionDone) break;
        }

        // -----------------------------
        // 2) ADD shift sur jour vide
        // -----------------------------
        if (allowAdd) {
          const currentVal = getRowDayValue(row, toDayKey);
          if (!isCellEmpty(currentVal)) {
            continue;
          }

          // Choisit un shift qui rapproche le mieux du delta restant
          const targetUnder = sb.underMinutes || 0;

          const rankedShifts = [...shiftLibrary].sort((a, b) => {
            const da = Math.abs((a.durationMinutes || 0) - targetUnder);
            const db = Math.abs((b.durationMinutes || 0) - targetUnder);
            if (da !== db) return da - db;
            return scoreShiftForGap(b) - scoreShiftForGap(a);
          });

          for (const shift of rankedShifts) {
            const canAdd = checkCanAddShift({
              rows: draftRows,
              row,
              dayKey: toDayKey,
              shift,
              options: { ...options, dayKeys },
            });

            if (!canAdd.ok) continue;

            draftRows = applyAddShift(draftRows, {
              rowIndex: sb.rowIndex,
              dayKey: toDayKey,
              shift,
            });

            actions.push({
              type: "add-shift",
              rowIndex: sb.rowIndex,
              rowId: sb.rowId,
              staffName: sb.name,
              dayKey: toDayKey,
              shift: {
                start: shift.start,
                end: shift.end,
                label: shift.label || "",
              },
              reason: "Combler un gap de couverture + réduire sous-planification",
            });

            logs.push(
              `➕ ${sb.name}: ajout ${toDayKey} (${shift.start}-${shift.end})`
            );

            actionDone = true;
            break;
          }

          if (actionDone) break;
        }
      }

      if (actionDone) break;
    }

    if (!actionDone) {
      logs.push("⛔ Aucune action supplémentaire possible avec les règles actuelles.");
      break;
    }
  }

  const afterCoverage = computeCoverageGaps(draftRows, { ...options, dayKeys });
  const afterStaffBalances = buildStaffBalanceRows(draftRows, { ...options, dayKeys });

  // Optionnel: branchage analyseur si dispo
  let analyzerBefore = null;
  let analyzerAfter = null;
  try {
    if (typeof computePlanningAnalysis === "function") {
      analyzerBefore = computePlanningAnalysis({ rows, options: { ...options, dayKeys } });
      analyzerAfter = computePlanningAnalysis({ rows: draftRows, options: { ...options, dayKeys } });
    }
  } catch {
    // no-op
  }

  // Optionnel: branchage gap helper si dispo
  let gapHelperBefore = null;
  let gapHelperAfter = null;
  try {
    if (typeof getCoverageGapsByDay === "function") {
      gapHelperBefore = getCoverageGapsByDay({ rows, options: { ...options, dayKeys } });
      gapHelperAfter = getCoverageGapsByDay({ rows: draftRows, options: { ...options, dayKeys } });
    }
  } catch {
    // no-op
  }

  // Vérification globale des règles (si util dispo)
  let ruleChecks = [];
  try {
    if (typeof evaluateRowAgainstRules === "function") {
      ruleChecks = (draftRows || []).map((row) => ({
        name: getRowName(row),
        result: evaluateRowAgainstRules({ row, rows: draftRows, options: { ...options, dayKeys } }),
      }));
    }
  } catch {
    // no-op
  }

  return {
    ok: true,
    draftRows,
    actions,
    logs,

    before: {
      coverage: beforeCoverage,
      staffBalances: beforeStaffBalances,
      analyzer: analyzerBefore,
      gapsByDay: gapHelperBefore,
    },

    after: {
      coverage: afterCoverage,
      staffBalances: afterStaffBalances,
      analyzer: analyzerAfter,
      gapsByDay: gapHelperAfter,
    },

    meta: {
      maxActions,
      actionsCount: actions.length,
      usedShiftLibrary: shiftLibrary.map((s) => ({
        id: s.id,
        label: s.label,
        start: s.start,
        end: s.end,
        durationMinutes: s.durationMinutes,
      })),
      ruleChecks,
    },
  };
}

/* -------------------------------------------------------
 * Generate UI-friendly suggestions only (non destructif)
 * ----------------------------------------------------- */

export function suggestAutoBalanceActions({ rows = [], options = {} } = {}) {
  const result = autoBalancePlanning({
    rows,
    options: {
      ...options,
      // limite légère pour suggestions
      maxActions: Number(options.maxActions) || 6,
    },
  });

  return {
    actions: result.actions || [],
    logs: result.logs || [],
    before: result.before,
    after: result.after,
    summary: {
      proposed: (result.actions || []).length,
      gapsBefore:
        Object.values(result?.before?.coverage?.gaps || {}).reduce((s, n) => s + (Number(n) || 0), 0),
      gapsAfter:
        Object.values(result?.after?.coverage?.gaps || {}).reduce((s, n) => s + (Number(n) || 0), 0),
    },
  };
}

/* -------------------------------------------------------
 * Apply actions to rows (si UI veut appliquer une sélection)
 * ----------------------------------------------------- */

export function applyAutoBalanceActions(rows = [], actions = []) {
  let draft = clone(rows);

  for (const a of actions || []) {
    if (a?.type === "add-shift") {
      draft = applyAddShift(draft, {
        rowIndex: a.rowIndex,
        dayKey: a.dayKey,
        shift: a.shift,
      });
    } else if (a?.type === "move-shift") {
      draft = applyMoveShift(draft, {
        rowIndex: a.rowIndex,
        fromDayKey: a.fromDayKey,
        toDayKey: a.toDayKey,
        shift: a.shift,
      });
    }
  }

  return draft;
}