// src/utils/planningAutoBalance.js
// DriveOps — RH Planning AutoBalance (stable signatures + aliases)
// Heuristique pragmatique : équilibre contrat + limite les dégâts couverture + respecte règles bloquantes.

import {
  DAY_KEYS_MON_START,
  parseShiftCellDetailed,
  parseShiftToMinutes,
  computeRowWeeklyMinutes,
  contractHoursToMinutes,
  wouldViolateRulesForCell,
  checkAvailabilityForCell,
} from "./planningRules";
import { analyzePlanning } from "./planningAnalyzer";

const DEFAULT_SHIFT_TEMPLATES = [
  { label: "Long matin", value: "06:00-13:30", minutes: 450, roles: ["prep", "coordo"] },
  { label: "Journée", value: "09:00-17:00", minutes: 480, roles: ["prep", "coordo"] },
  { label: "Fermeture", value: "13:30-21:00", minutes: 450, roles: ["prep", "coordo"] },
  { label: "Court matin", value: "06:00-10:00", minutes: 240, roles: ["prep", "coordo"] },
  { label: "Midi", value: "11:00-15:00", minutes: 240, roles: ["prep", "coordo"] },
  { label: "Soir", value: "17:00-21:30", minutes: 270, roles: ["prep", "coordo"] },
  { label: "Coordo journée", value: "08:00-16:00", minutes: 480, roles: ["coordo"] },
  { label: "Coordo ouverture", value: "06:00-14:00", minutes: 480, roles: ["coordo"] },
];

const DEFAULT_OPTIONS = {
  mode: "contract-balance",
  toleranceMinutes: 30,
  maxPatches: 60,
  keepAbsenceCodes: true,
  preserveManualCodes: true, // si suffixe /CODE présent, on évite de toucher
  allowSetRestOnOverplan: true,
  rebalanceCoverage: true,
  rules: {}, // passed to planningRules.evaluatePlanningRules via wouldViolateRulesForCell
};

function cloneRows(rows = []) {
  return rows.map((r) => ({
    ...r,
    cells: { ...(r?.cells || {}) },
    skills: Array.isArray(r?.skills) ? [...r.skills] : r?.skills,
    availability: r?.availability && typeof r.availability === "object" ? { ...r.availability } : r?.availability,
  }));
}

function normalizeRole(role) {
  return String(role || "prep").trim().toLowerCase();
}

function getShiftTemplates(input, options) {
  const cfg = input?.docConfig || input?.planningDoc?.config || {};
  const custom = Array.isArray(cfg?.autoBalance?.shiftTemplates)
    ? cfg.autoBalance.shiftTemplates
    : Array.isArray(cfg?.shiftTemplates)
    ? cfg.shiftTemplates
    : null;

  const src = custom && custom.length ? custom : DEFAULT_SHIFT_TEMPLATES;
  return src
    .map((s) => {
      const value = String(s?.value || "").trim().toUpperCase();
      const d = parseShiftCellDetailed(value);
      if (!d.isWork) return null;
      return {
        label: s?.label || value,
        value,
        minutes: d.durationMin,
        roles: Array.isArray(s?.roles) && s.roles.length ? s.roles.map((r) => String(r).toLowerCase()) : null,
      };
    })
    .filter(Boolean);
}

function getCoveragePriorityMap(analysis) {
  const map = new Map(); // key dayKey -> score
  const gaps = Array.isArray(analysis?.coverageGaps) ? analysis.coverageGaps : [];
  for (const g of gaps) {
    const cur = map.get(g.dayKey) || 0;
    const weight =
      g.type === "coverage_total_gap"
        ? (g.gap || 1) * 3
        : g.type === "coverage_skill_gap"
        ? (g.gap || 1) * 2
        : 1;
    map.set(g.dayKey, cur + weight);
  }
  return map;
}

function rowDeltaMinutes(row) {
  return computeRowWeeklyMinutes(row?.cells || {}) - contractHoursToMinutes(row?.contractHours);
}

function hasManualSuffixCode(cell) {
  const d = parseShiftCellDetailed(cell);
  return d.isWork && !!d.code;
}

function canTouchCell(cell, opts) {
  const d = parseShiftCellDetailed(cell);
  if (d.type === "absence" && opts.keepAbsenceCodes) return false;
  if (opts.preserveManualCodes && hasManualSuffixCode(cell)) return false;
  return true;
}

function daySortForUnderplan(row, analysis, dayKeys) {
  const coverageMap = getCoveragePriorityMap(analysis);
  const rowsByDayDeficit = dayKeys.map((dayKey, idx) => {
    const cell = row?.cells?.[dayKey];
    const d = parseShiftCellDetailed(cell);
    const hasWork = d.isWork;
    const hasAny = d.type !== "empty";
    const coverageScore = coverageMap.get(dayKey) || 0;

    // priorité : jours vides > jours repos/absence > jours déjà travaillés
    let base = 0;
    if (!hasAny) base = 100;
    else if (!hasWork) base = 70;
    else base = 20;

    return {
      dayKey,
      idx,
      score: base + coverageScore,
      hasWork,
      cell,
    };
  });

  return rowsByDayDeficit.sort((a, b) => b.score - a.score);
}

function scoreTemplateForDayShift(templateValue, dayKey, currentAnalysis) {
  const d = parseShiftCellDetailed(templateValue);
  if (!d.isWork) return 0;

  let score = d.durationMin / 60; // base : favorise les longues durées pour combler déficit contrat
  if (!currentAnalysis?.needsBySlot?.length) return score;

  // bonus si couvre des slots en gap total / skill
  const slotsForDay = currentAnalysis.needsBySlot.filter((s) => s.dayKey === dayKey);
  for (const slot of slotsForDay) {
    const slotD = parseShiftCellDetailed(`${slot.slotStart}-${slot.slotEnd}`);
    if (!slotD.isWork) continue;
    const overlap = d.startMin < slotD.endMin && d.endMin > slotD.startMin;
    if (!overlap) continue;

    if (slot.totalGap > 0) score += slot.totalGap * 3;
    if ((slot.skillGaps || []).length > 0) score += (slot.skillGaps || []).length * 2;
  }

  return score;
}

function getTemplatesForRow(row, allTemplates, targetAddMinutes) {
  const role = normalizeRole(row?.role);
  const candidates = allTemplates.filter((t) => !t.roles || t.roles.includes(role));

  // tri pour coller à l'écart à combler
  return [...candidates].sort((a, b) => {
    const da = Math.abs((a.minutes || 0) - targetAddMinutes);
    const db = Math.abs((b.minutes || 0) - targetAddMinutes);
    return da - db;
  });
}

function isCellEligibleForReplacement(cell) {
  const d = parseShiftCellDetailed(cell);
  return d.isWork;
}

function generateShorterCandidates(currentCell, templatesForRow) {
  const curMin = parseShiftToMinutes(currentCell);
  return templatesForRow
    .filter((t) => t.minutes < curMin)
    .sort((a, b) => b.minutes - a.minutes); // on raccourcit progressivement
}

function generateLongerCandidates(currentCell, templatesForRow) {
  const curMin = parseShiftToMinutes(currentCell);
  return templatesForRow
    .filter((t) => t.minutes > curMin)
    .sort((a, b) => a.minutes - b.minutes);
}

function testPatchAgainstRules(rows, rowIndex, dayKey, nextValue, input, opts) {
  const res = wouldViolateRulesForCell({
    rows,
    rowIndex,
    dayKey,
    nextCellValue: nextValue,
    input,
    options: opts.rules || {},
  });
  return !res.blocked;
}

function testPatchAgainstAvailability(row, dayKey, nextValue) {
  return checkAvailabilityForCell(row, dayKey, nextValue).ok;
}

function applyPatch(rows, patch) {
  const row = rows.find((r) => r.id === patch.rowId);
  if (!row) return false;
  row.cells = { ...(row.cells || {}), [patch.dayKey]: patch.value };
  return true;
}

function getRowIndex(rows, rowId) {
  return rows.findIndex((r) => r.id === rowId);
}

function buildDiagnosticsSummary(rowsBefore, rowsAfter) {
  const byStaff = rowsAfter.map((r) => {
    const before = rowsBefore.find((x) => x.id === r.id);
    const beforeDelta = rowDeltaMinutes(before || r);
    const afterDelta = rowDeltaMinutes(r);
    return {
      rowId: r.id,
      staff: r.name || "—",
      beforeDeltaMinutes: beforeDelta,
      afterDeltaMinutes: afterDelta,
      improvedMinutes: Math.abs(beforeDelta) - Math.abs(afterDelta),
    };
  });

  return {
    byStaff,
    totalAbsDeltaBefore: byStaff.reduce((s, x) => s + Math.abs(x.beforeDeltaMinutes), 0),
    totalAbsDeltaAfter: byStaff.reduce((s, x) => s + Math.abs(x.afterDeltaMinutes), 0),
  };
}

export function autoBalancePlanning(input = {}, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const dayKeys = Array.isArray(input?.dayKeysMonStart) ? input.dayKeysMonStart : DAY_KEYS_MON_START;
  const originalRows = Array.isArray(input?.rows) ? input.rows : [];
  const rows = cloneRows(originalRows);
  const templates = getShiftTemplates(input, opts);
  const patches = [];

  if (!rows.length || !templates.length) {
    return {
      appliedCount: 0,
      patches: [],
      rows,
      diagnostics: { reason: "no_rows_or_templates" },
    };
  }

  let analysis = analyzePlanning({ ...input, rows });
  let patchBudget = Math.max(1, Number(opts.maxPatches) || 60);

  // ---------- PASS 1 : combler sous-planification (priorité contrat + couverture)
  const underRows = [...rows]
    .map((r) => ({ rowId: r.id, delta: rowDeltaMinutes(r) }))
    .filter((x) => x.delta < -(Number(opts.toleranceMinutes) || 0))
    .sort((a, b) => a.delta - b.delta); // plus négatif d'abord

  for (const item of underRows) {
    if (patchBudget <= 0) break;

    const rowIndex = getRowIndex(rows, item.rowId);
    if (rowIndex < 0) continue;
    const row = rows[rowIndex];

    let currentDelta = rowDeltaMinutes(row); // négatif = manque
    const sortedDays = daySortForUnderplan(row, analysis, dayKeys);

    for (const dInfo of sortedDays) {
      if (patchBudget <= 0) break;
      if (currentDelta >= -(Number(opts.toleranceMinutes) || 0)) break;

      const { dayKey } = dInfo;
      const currentCell = row?.cells?.[dayKey] || "";

      if (!canTouchCell(currentCell, opts)) continue;

      // 1) Si cellule vide / absence -> essayer d'ajouter un shift
      const currentParsed = parseShiftCellDetailed(currentCell);
      const wantedAdd = Math.abs(currentDelta);
      const rowTemplates = getTemplatesForRow(row, templates, wantedAdd)
        .sort(
          (a, b) =>
            scoreTemplateForDayShift(b.value, dayKey, analysis) - scoreTemplateForDayShift(a.value, dayKey, analysis)
        );

      if (!currentParsed.isWork) {
        for (const tpl of rowTemplates) {
          if (!testPatchAgainstAvailability(row, dayKey, tpl.value)) continue;
          if (!testPatchAgainstRules(rows, rowIndex, dayKey, tpl.value, input, opts)) continue;

          const patch = { rowId: row.id, dayKey, value: tpl.value, reason: "fill_underplan" };
          if (applyPatch(rows, patch)) {
            patches.push(patch);
            patchBudget -= 1;
            analysis = analyzePlanning({ ...input, rows });
            currentDelta = rowDeltaMinutes(row);
            break;
          }
        }
      } else {
        // 2) Si déjà un shift, tenter un shift plus long
        const longer = generateLongerCandidates(currentCell, rowTemplates).sort(
          (a, b) =>
            scoreTemplateForDayShift(b.value, dayKey, analysis) - scoreTemplateForDayShift(a.value, dayKey, analysis)
        );

        for (const tpl of longer) {
          if (!testPatchAgainstAvailability(row, dayKey, tpl.value)) continue;
          if (!testPatchAgainstRules(rows, rowIndex, dayKey, tpl.value, input, opts)) continue;

          const before = Math.abs(currentDelta);
          const afterProjected = Math.abs(currentDelta + (tpl.minutes - parseShiftToMinutes(currentCell)));
          if (afterProjected >= before) continue;

          const patch = { rowId: row.id, dayKey, value: tpl.value, reason: "extend_underplan" };
          if (applyPatch(rows, patch)) {
            patches.push(patch);
            patchBudget -= 1;
            analysis = analyzePlanning({ ...input, rows });
            currentDelta = rowDeltaMinutes(row);
            break;
          }
        }
      }
    }
  }

  // ---------- PASS 2 : réduire sur-planification (sans trop casser la couverture)
  const overRows = [...rows]
    .map((r) => ({ rowId: r.id, delta: rowDeltaMinutes(r) }))
    .filter((x) => x.delta > (Number(opts.toleranceMinutes) || 0))
    .sort((a, b) => b.delta - a.delta); // plus positif d'abord

  for (const item of overRows) {
    if (patchBudget <= 0) break;

    const rowIndex = getRowIndex(rows, item.rowId);
    if (rowIndex < 0) continue;
    const row = rows[rowIndex];

    let currentDelta = rowDeltaMinutes(row);
    if (currentDelta <= (Number(opts.toleranceMinutes) || 0)) continue;

    const roleTemplates = getShiftTemplates(input, opts).filter((t) => {
      const role = normalizeRole(row?.role);
      return !t.roles || t.roles.includes(role);
    });

    // prioriser les jours où la couverture a le moins de déficit
    const dayCoverageMap = new Map(
      dayKeys.map((k) => [k, (analysis?.coverageSummary?.byDay?.[k]?.totalGap || 0)])
    );
    const workedDays = dayKeys
      .map((dayKey) => ({
        dayKey,
        cell: row?.cells?.[dayKey] || "",
        gapScore: dayCoverageMap.get(dayKey) || 0,
      }))
      .filter((x) => isCellEligibleForReplacement(x.cell))
      .sort((a, b) => a.gapScore - b.gapScore); // moins critique d'abord

    for (const wd of workedDays) {
      if (patchBudget <= 0) break;
      if (currentDelta <= (Number(opts.toleranceMinutes) || 0)) break;

      const { dayKey, cell } = wd;
      if (!canTouchCell(cell, opts)) continue;

      const shorterCandidates = generateShorterCandidates(cell, roleTemplates);
      let patched = false;

      for (const tpl of shorterCandidates) {
        if (!testPatchAgainstAvailability(row, dayKey, tpl.value)) continue;
        if (!testPatchAgainstRules(rows, rowIndex, dayKey, tpl.value, input, opts)) continue;

        // Éviter d'aggraver trop la couverture si possible
        if (opts.rebalanceCoverage) {
          const beforeAnalysis = analysis;
          const tempRows = cloneRows(rows);
          const tempRow = tempRows[rowIndex];
          tempRow.cells[dayKey] = tpl.value;
          const afterAnalysis = analyzePlanning({ ...input, rows: tempRows });

          const beforeGap = beforeAnalysis?.coverageSummary?.byDay?.[dayKey]?.totalGap || 0;
          const afterGap = afterAnalysis?.coverageSummary?.byDay?.[dayKey]?.totalGap || 0;

          // tolérance : on évite si on augmente fortement le gap journalier
          if (afterGap - beforeGap >= 2) {
            continue;
          }
        }

        const curMin = parseShiftToMinutes(cell);
        const nextDelta = currentDelta - (curMin - tpl.minutes);
        if (Math.abs(nextDelta) >= Math.abs(currentDelta)) continue;

        const patch = { rowId: row.id, dayKey, value: tpl.value, reason: "reduce_overplan" };
        if (applyPatch(rows, patch)) {
          patches.push(patch);
          patchBudget -= 1;
          analysis = analyzePlanning({ ...input, rows });
          currentDelta = rowDeltaMinutes(row);
          patched = true;
          break;
        }
      }

      if (patched) continue;

      // Dernier recours : mettre RH/OFF si autorisé
      if (opts.allowSetRestOnOverplan && canTouchCell(cell, opts)) {
        const restValue = "OFF";
        if (testPatchAgainstRules(rows, rowIndex, dayKey, restValue, input, opts)) {
          const curMin = parseShiftToMinutes(cell);
          const nextDelta = currentDelta - curMin;

          if (Math.abs(nextDelta) < Math.abs(currentDelta)) {
            const patch = { rowId: row.id, dayKey, value: restValue, reason: "remove_shift_overplan" };
            if (applyPatch(rows, patch)) {
              patches.push(patch);
              patchBudget -= 1;
              analysis = analyzePlanning({ ...input, rows });
              currentDelta = rowDeltaMinutes(row);
            }
          }
        }
      }
    }
  }

  const diagnostics = buildDiagnosticsSummary(originalRows, rows);

  return {
    appliedCount: patches.length,
    patches,
    rows,
    updatedRows: rows, // compat
    diagnostics: {
      ...diagnostics,
      remainingPatchBudget: patchBudget,
      coverageGapsCount: analysis?.summary?.coverageGapsCount || 0,
      estimatedPayrollCost: analysis?.summary?.estimatedPayrollCost || 0,
    },
    analysisAfter: analysis,
  };
}

/* ===========================
   Aliases rétrocompatibles
   =========================== */

export const runAutoBalance = autoBalancePlanning;
export const balancePlanning = autoBalancePlanning;
export const computeAutoBalance = autoBalancePlanning;

export default autoBalancePlanning;