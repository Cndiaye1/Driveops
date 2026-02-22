// src/utils/planningAnalyzer.js

import {
  parseCellValue,
  getContractDelta,
  formatMinutesToHoursLabel,
} from "./planning";
import {
  DAY_KEYS_UI_ORDER,
  mergePlanningRules,
  dayLabel,
  severityRank,
} from "./planningRules";

function upper(v) {
  return String(v || "").trim().toUpperCase();
}

function timeToMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

function rowRoleLabel(role) {
  const r = String(role || "").toLowerCase();
  if (r === "coordo") return "Coordo";
  if (r === "prep") return "Prépa";
  return "Autre";
}

export function getRowWeekWorkedMinutes(row) {
  const cells = row?.cells || {};
  return DAY_KEYS_UI_ORDER.reduce((sum, dayKey) => {
    const parsed = parseCellValue(cells[dayKey]);
    return sum + (parsed.workedMinutes || 0);
  }, 0);
}

export function getRowDayParsed(row, dayKey) {
  return parseCellValue(row?.cells?.[dayKey]);
}

export function computeContractDiagnostics(rows = [], options = {}) {
  const rules = mergePlanningRules(options?.rules);
  const toleranceMinutes = rules.contractToleranceMinutes;

  return (rows || [])
    .map((row) => {
      const workedMinutes = getRowWeekWorkedMinutes(row);
      const contractHours = Number(row?.contractHours) || 0;
      const deltaInfo = getContractDelta({
        contractHours,
        workedMinutes,
        toleranceMinutes,
      });

      return {
        rowId: row?.id,
        name: upper(row?.name),
        role: row?.role || "prep",
        roleLabel: rowRoleLabel(row?.role),
        contractHours,
        workedMinutes,
        targetMinutes: deltaInfo.targetMinutes,
        deltaMinutes: deltaInfo.deltaMinutes,
        absDeltaMinutes: deltaInfo.absDeltaMinutes,
        status: deltaInfo.status, // under | ok | over
      };
    })
    .sort((a, b) => {
      const diff = (b.absDeltaMinutes || 0) - (a.absDeltaMinutes || 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "fr");
    });
}

export function computeCoverageByDay(rows = [], options = {}) {
  const rules = mergePlanningRules(options?.rules);
  const blocks = rules.coverageBlocks || [];
  const out = {};

  for (const dayKey of DAY_KEYS_UI_ORDER) {
    out[dayKey] = {};

    for (const block of blocks) {
      const bs = timeToMinutes(block.start);
      const be = timeToMinutes(block.end);

      let count = 0;
      const assigned = [];

      for (const row of rows || []) {
        const parsed = parseCellValue(row?.cells?.[dayKey]);

        if (parsed.type !== "shift") continue;
        if (!parsed.start || !parsed.end) continue;
        if ((parsed.workedMinutes || 0) <= 0) continue; // ex: "06:00-13:30 / RH"

        const rs = timeToMinutes(parsed.start);
        const re = timeToMinutes(parsed.end);
        if (rs == null || re == null || bs == null || be == null) continue;

        if (overlaps(rs, re, bs, be)) {
          count += 1;
          assigned.push({
            rowId: row?.id,
            name: upper(row?.name),
            role: row?.role || "prep",
          });
        }
      }

      const minStaff = Math.max(0, Number(block.minStaff) || 0);

      out[dayKey][block.id] = {
        ...block,
        dayKey,
        count,
        assigned,
        minStaff,
        gap: Math.max(0, minStaff - count),
        surplus: Math.max(0, count - minStaff),
        ok: count >= minStaff,
      };
    }
  }

  return out;
}

export function buildPlanningRecommendations(rows = [], options = {}) {
  const rules = mergePlanningRules(options?.rules);
  const maxItems = Math.max(1, Number(options?.maxItems) || 12);

  const contractDiagnostics = computeContractDiagnostics(rows, { rules });
  const coverageByDay = computeCoverageByDay(rows, { rules });

  const recommendations = [];

  // 1) Écarts contrat
  for (const d of contractDiagnostics) {
    if (d.status === "under") {
      recommendations.push({
        type: "contract-under",
        severity: d.absDeltaMinutes >= 240 ? "high" : "medium",
        rowId: d.rowId,
        name: d.name,
        title: `${d.name} sous-planifié`,
        detail: `${d.roleLabel} • Contrat ${d.contractHours}h • Écart ${formatMinutesToHoursLabel(
          d.deltaMinutes
        )}`,
        action: "Ajouter un shift court ou allonger 1-2 créneaux.",
      });
    } else if (d.status === "over") {
      recommendations.push({
        type: "contract-over",
        severity: d.absDeltaMinutes >= 240 ? "high" : "medium",
        rowId: d.rowId,
        name: d.name,
        title: `${d.name} sur-planifié`,
        detail: `${d.roleLabel} • Contrat ${d.contractHours}h • Écart +${formatMinutesToHoursLabel(
          Math.abs(d.deltaMinutes)
        )}`,
        action: "Réduire un créneau / déplacer vers un collègue sous-planifié.",
      });
    }
  }

  // 2) Couverture par bloc
  for (const dayKey of DAY_KEYS_UI_ORDER) {
    const dayMap = coverageByDay[dayKey] || {};
    for (const block of rules.coverageBlocks) {
      const c = dayMap[block.id];
      if (!c) continue;

      if (!c.ok) {
        recommendations.push({
          type: "coverage-gap",
          severity: c.gap >= 2 ? "high" : "medium",
          dayKey,
          blockId: block.id,
          title: `${dayLabel(dayKey)} • ${block.label} sous-couvert`,
          detail: `${c.count}/${c.minStaff} planifiés (${block.start}-${block.end})`,
          action: `Ajouter ${c.gap} personne(s) sur ce créneau.`,
        });
      } else if (c.surplus >= 2) {
        recommendations.push({
          type: "coverage-surplus",
          severity: "low",
          dayKey,
          blockId: block.id,
          title: `${dayLabel(dayKey)} • ${block.label} sur-couvert`,
          detail: `${c.count}/${c.minStaff} planifiés (${block.start}-${block.end})`,
          action: "Possibilité de déplacer 1 personne vers un autre créneau.",
        });
      }
    }
  }

  recommendations.sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    if (s !== 0) return s;
    return String(a.title || "").localeCompare(String(b.title || ""), "fr");
  });

  return {
    rules,
    contractDiagnostics,
    coverageByDay,
    recommendations: recommendations.slice(0, maxItems),
    meta: {
      totalRows: Array.isArray(rows) ? rows.length : 0,
      generatedAt: new Date().toISOString(),
    },
  };
}