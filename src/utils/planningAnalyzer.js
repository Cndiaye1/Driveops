// src/utils/planningAnalyzer.js
/* =========================================================
   planningAnalyzer.js — Sprint 3 PRO / stable signatures
   Exports:
   - analyzePlanning(input, options?)
   - aliases: analyzeWeekPlanning, getPlanningAnalysis, computePlanningAnalysis
   - default = analyzePlanning

   ✅ Compatible PlanningRH + planningAutoBalance
   ✅ Support doc.config (coverage / requirements / costing / ops)
   ✅ Support runtime DLX (doc.runtime.dlx) pour analyse temps réel
   ========================================================= */

const DAY_KEYS_MON_START_DEFAULT = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ABSENCE_CODES = new Set(["RH", "CP", "OFF", "AT", "MAL", "ABS", "CONGE", "VAC"]);

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function minToHHMM(min) {
  const x = ((Number(min) % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60);
  const m = x % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function minutesToHourLabel(min) {
  const sign = Number(min) < 0 ? "-" : "";
  const abs = Math.abs(Number(min) || 0);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}h${pad2(m)}` : `${sign}${h}h`;
}

function normalizeKey(v) {
  return String(v || "").trim();
}

function normalizeSkillKey(v) {
  return String(v || "").trim().toUpperCase();
}

function normalizeDayKeys(input) {
  return Array.isArray(input?.dayKeysMonStart) && input.dayKeysMonStart.length === 7
    ? input.dayKeysMonStart
    : DAY_KEYS_MON_START_DEFAULT;
}

/* ---------------------------
   Cell parsing
---------------------------- */
function parseShiftCell(cell) {
  const raw0 = String(cell || "").trim();
  const raw = raw0.toUpperCase();
  if (!raw) return { kind: "empty", raw, durationMin: 0 };

  if (ABSENCE_CODES.has(raw)) {
    return { kind: "absence", raw, code: raw, durationMin: 0 };
  }

  const normalized = raw.replace(/[H]/g, ":").replace(/\s+/g, "");
  const m = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\/([A-Z0-9_-]+))?$/);
  if (!m) return { kind: "unknown", raw, durationMin: 0 };

  const start = m[1];
  const end = m[2];
  const code = String(m[3] || "").toUpperCase();

  // rétrocompat : suffixe code d'absence => considéré absence
  if (code && ABSENCE_CODES.has(code)) {
    return { kind: "absence", raw, code, start, end, durationMin: 0 };
  }

  const startMin = hhmmToMin(start);
  const endMin = hhmmToMin(end);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return { kind: "unknown", raw, durationMin: 0 };

  let durationMin = endMin - startMin;
  let crossesMidnight = false;
  if (durationMin < 0) {
    durationMin += 1440;
    crossesMidnight = true;
  }

  return {
    kind: "work",
    raw,
    start,
    end,
    code,
    startMin,
    endMin,
    absoluteEndMin: crossesMidnight ? endMin + 1440 : endMin,
    durationMin,
    crossesMidnight,
  };
}

function getWeeklyMinutes(cells, dayKeys) {
  let total = 0;
  for (const dk of dayKeys) total += parseShiftCell(cells?.[dk]).durationMin || 0;
  return total;
}

function normalizeSkillList(skills) {
  if (Array.isArray(skills)) {
    return skills
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase());
  }
  if (typeof skills === "string") {
    return skills
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase());
  }
  return [];
}

/* ---------------------------
   Config resolution (doc.config-friendly)
---------------------------- */
function getDocConfig(input) {
  return (
    input?.docConfig ||
    input?.planningDoc?.config ||
    input?.doc?.config ||
    {}
  );
}

function getRuntime(input) {
  return (
    input?.runtime ||
    input?.planningDoc?.runtime ||
    input?.doc?.runtime ||
    {}
  );
}

function getCostingConfig(input) {
  const docConfig = getDocConfig(input);
  return {
    ...(docConfig?.costing || {}),
    ...(input?.costing || {}),
  };
}

function getHourlyRateForRow(row, input) {
  const direct = Number(row?.hourlyRate);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const costing = getCostingConfig(input);

  const roleKey = String(row?.role || "").toLowerCase();
  const byRole = costing?.hourlyRatesByRole || costing?.hourlyRateByRole || {};
  const roleRate = Number(byRole?.[roleKey]);
  if (Number.isFinite(roleRate) && roleRate > 0) return roleRate;

  const fallback = Number(costing?.defaultHourlyRate ?? costing?.hourlyRate);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;

  // legacy input.defaults support
  const legacyRole = Number(input?.defaults?.hourlyRateByRole?.[row?.role]);
  if (Number.isFinite(legacyRole) && legacyRole > 0) return legacyRole;
  const legacyFallback = Number(input?.defaults?.hourlyRate);
  if (Number.isFinite(legacyFallback) && legacyFallback > 0) return legacyFallback;

  return 0;
}

function normalizeCoverageConfig(input, options) {
  const docConfig = getDocConfig(input);

  const c = {
    ...(docConfig?.coverage || {}),
    ...(input?.defaults?.coverage || {}),
    ...(input?.coverageConfig || {}),
    ...(options?.coverage || {}),
  };

  const slotMinutes = Math.max(15, Number(c.slotMinutes) || 30);
  const from = String(c.from || "06:00");
  const to = String(c.to || "22:00");
  const fromMin = hhmmToMin(from);
  let toMin = hhmmToMin(to);

  if (!Number.isFinite(fromMin)) return { slotMinutes: 30, fromMin: 360, toMin: 1320 };
  if (!Number.isFinite(toMin)) toMin = 1320;
  if (toMin <= fromMin) toMin = fromMin + 16 * 60;

  return { slotMinutes, fromMin, toMin };
}

/**
 * Requirements formats supported:
 * requirementsByDaySlot[dayKey][slotKey] = number
 * requirementsByDaySlot[dayKey][slotKey] = { total, roles:{prep:2}, skills:{pgc:1} }
 */
function normalizeRequirements(input) {
  const docConfig = getDocConfig(input);

  return (
    docConfig?.requirementsByDaySlot ||
    input?.requirementsByDaySlot ||
    input?.doc?.requirementsByDaySlot ||
    input?.coverageRequirements ||
    {}
  );
}

function resolveRequirementForSlot(requirementsByDaySlot, dayKey, slotStartMin, slotEndMin) {
  const dayReq = requirementsByDaySlot?.[dayKey];
  if (!dayReq || typeof dayReq !== "object") {
    return { total: 0, roles: {}, skills: {} };
  }

  const kStart = minToHHMM(slotStartMin);
  const kRange = `${minToHHMM(slotStartMin)}-${minToHHMM(slotEndMin)}`;

  const raw = dayReq[kRange] ?? dayReq[kStart] ?? null;
  if (raw == null) return { total: 0, roles: {}, skills: {} };

  if (typeof raw === "number") {
    return { total: Math.max(0, raw), roles: {}, skills: {} };
  }

  if (typeof raw === "object") {
    const total = Math.max(0, Number(raw.total ?? raw.need ?? 0) || 0);
    const roles = {};
    const skills = {};

    if (raw.roles && typeof raw.roles === "object") {
      for (const [k, v] of Object.entries(raw.roles)) {
        const n = Math.max(0, Number(v) || 0);
        if (n > 0) roles[String(k).toLowerCase()] = n;
      }
    }

    if (raw.skills && typeof raw.skills === "object") {
      for (const [k, v] of Object.entries(raw.skills)) {
        const n = Math.max(0, Number(v) || 0);
        if (n > 0) skills[String(k).toLowerCase()] = n;
      }
    }

    return { total, roles, skills };
  }

  return { total: 0, roles: {}, skills: {} };
}

/* ---------------------------
   Coverage computation
---------------------------- */
function rowWorksOnSlot(row, dayKey, slotStartMin) {
  const parsed = parseShiftCell(row?.cells?.[dayKey]);
  if (parsed.kind !== "work") return false;

  // overnight: on limite la couverture à la portion du jour courant
  if (parsed.crossesMidnight) {
    return slotStartMin >= parsed.startMin;
  }

  return slotStartMin >= parsed.startMin && slotStartMin < parsed.endMin;
}

function aggregateCoverageForSlot(rows, dayKey, slotStartMin) {
  const plannedRows = rows.filter((r) => rowWorksOnSlot(r, dayKey, slotStartMin));
  const plannedTotal = plannedRows.length;

  const plannedRoles = {};
  const plannedSkills = {};
  const codes = {};

  for (const r of plannedRows) {
    const role = String(r?.role || "prep").toLowerCase();
    plannedRoles[role] = (plannedRoles[role] || 0) + 1;

    const skills = normalizeSkillList(r?.skills);
    for (const sk of skills) plannedSkills[sk] = (plannedSkills[sk] || 0) + 1;

    const parsed = parseShiftCell(r?.cells?.[dayKey]);
    if (parsed.code) {
      const code = String(parsed.code).toLowerCase();
      codes[code] = (codes[code] || 0) + 1;
    }
  }

  return { plannedRows, plannedTotal, plannedRoles, plannedSkills, codes };
}

/* ---------------------------
   Ops / DLX live analysis
---------------------------- */
function getOpsConfig(input) {
  const docConfig = getDocConfig(input);
  return {
    ...(docConfig?.ops || {}),
    ...(input?.opsConfig || {}),
  };
}

function normalizeOpsSkillsCatalog(opsCfg = {}) {
  const raw = opsCfg?.skillsCatalog || opsCfg?.skills || {};
  const out = {};

  for (const [k, v] of Object.entries(raw)) {
    const key = normalizeSkillKey(k);
    const conf = typeof v === "object" && v ? v : {};
    out[key] = {
      key,
      label: String(conf.label || key),
      icon: conf.icon || "",
      category: conf.category || "ops",
      trackBacklog: conf.trackBacklog !== false,
      productivityPerHour: Number(conf.productivityPerHour ?? conf.ratePerHour ?? 0) || 0,
      // ex: LIV 5 min promesse
      slaMinutes: Number(conf.slaMinutes ?? 0) || 0,
      // pour calculer un besoin "combien de personnes pour absorber le backlog"
      clearWithinMinutes: Number(conf.clearWithinMinutes ?? opsCfg?.horizonMinutesDefault ?? 60) || 60,
      unitLabel: String(conf.unitLabel || "tâches"),
    };
  }

  // fallback minimal si rien n'est défini
  if (!Object.keys(out).length) {
    out.PGC = { key: "PGC", label: "PGC", trackBacklog: true, productivityPerHour: 200, clearWithinMinutes: 60, slaMinutes: 0, unitLabel: "tâches", category: "prep", icon: "📦" };
    out.FS = { key: "FS", label: "FS", trackBacklog: true, productivityPerHour: 200, clearWithinMinutes: 60, slaMinutes: 0, unitLabel: "tâches", category: "prep", icon: "🏷️" };
    out.MES = { key: "MES", label: "MES", trackBacklog: true, productivityPerHour: 40, clearWithinMinutes: 60, slaMinutes: 0, unitLabel: "tâches", category: "stock", icon: "📥" };
    out.LIV = { key: "LIV", label: "LIV", trackBacklog: true, productivityPerHour: 12, clearWithinMinutes: 15, slaMinutes: 5, unitLabel: "clients", category: "service", icon: "🚚" };
  }

  return out;
}

function getDlxRuntime(input) {
  const runtime = getRuntime(input);
  const opsCfg = getOpsConfig(input);

  // Supporte plusieurs emplacements pour compatibilité
  const dlx =
    runtime?.dlx ||
    runtime?.ops?.dlx ||
    opsCfg?.dlxLive ||
    {};

  const skills = dlx?.skills && typeof dlx.skills === "object" ? dlx.skills : {};
  return {
    updatedAt: dlx?.updatedAt || null,
    notes: dlx?.notes || "",
    horizonMinutesOverride: Number(dlx?.horizonMinutesOverride) || 0,
    skills,
  };
}

function getPlannedWorkingCountsNow(rows, dayKeys) {
  // version simple/hebdo : pas de "now" par slot -> on utilise moyenne de présence par jour + global
  // Ici on fournit surtout des stats planning utiles, sans horodatage live.
  const byRole = {};
  const bySkill = {};

  for (const r of rows) {
    const role = String(r?.role || "prep").toLowerCase();
    byRole[role] = (byRole[role] || 0) + 1;

    const skills = normalizeSkillList(r?.skills);
    for (const sk of skills) bySkill[sk] = (bySkill[sk] || 0) + 1;
  }

  return { byRole, bySkill };
}

function analyzeOpsDlx(input, rows) {
  const opsCfg = getOpsConfig(input);
  const catalog = normalizeOpsSkillsCatalog(opsCfg);
  const dlx = getDlxRuntime(input);
  const planningHeadcount = getPlannedWorkingCountsNow(rows, normalizeDayKeys(input));

  const horizonDefault = Math.max(
    5,
    Number(dlx.horizonMinutesOverride || opsCfg?.horizonMinutesDefault || 60) || 60
  );

  const perSkill = [];
  const alerts = [];

  for (const [skillKey, conf] of Object.entries(catalog)) {
    const live = (dlx.skills && dlx.skills[skillKey]) || (dlx.skills && dlx.skills[skillKey.toLowerCase()]) || {};
    const backlogTasks = Math.max(0, Number(live?.backlogTasks ?? live?.tasks ?? 0) || 0);
    const incomingTasksPerHour = Math.max(0, Number(live?.incomingTasksPerHour ?? 0) || 0);
    const activeNow = Math.max(0, Number(live?.activeNow ?? live?.staffNow ?? 0) || 0);
    const plannedAssigned = Math.max(
      0,
      Number(live?.plannedAssigned ?? planningHeadcount.bySkill?.[skillKey.toLowerCase()] ?? 0) || 0
    );

    const rate = Math.max(
      0,
      Number(conf?.productivityPerHour || 0) ||
        // si LIV sans rate mais SLA 5min => ~12/h
        (Number(conf?.slaMinutes) > 0 ? 60 / Number(conf.slaMinutes) : 0)
    );

    const clearWithinMinutes = Math.max(5, Number(conf?.clearWithinMinutes || horizonDefault) || horizonDefault);
    const horizonHours = clearWithinMinutes / 60;

    const requiredForBacklog = rate > 0 && backlogTasks > 0
      ? Math.ceil(backlogTasks / (rate * horizonHours))
      : 0;

    const requiredForFlow = rate > 0 && incomingTasksPerHour > 0
      ? Math.ceil(incomingTasksPerHour / rate)
      : 0;

    const requiredNow = Math.max(requiredForBacklog, requiredForFlow);
    const recommendedNow = requiredNow; // alias lisible métier

    const capacityNowTasksPerHour = activeNow > 0 && rate > 0 ? activeNow * rate : 0;
    const estimatedClearMinutes =
      activeNow > 0 && rate > 0 && backlogTasks > 0
        ? Math.ceil((backlogTasks / (activeNow * rate)) * 60)
        : backlogTasks > 0 && rate > 0
        ? Math.ceil((backlogTasks / rate) * 60) // estimation avec 1 personne si non renseigné
        : 0;

    const capacityGap = Math.max(0, requiredNow - activeNow);
    const assignmentGap = Math.max(0, requiredNow - plannedAssigned);

    const rec = {
      skillKey,
      label: conf.label || skillKey,
      icon: conf.icon || "",
      unitLabel: conf.unitLabel || "tâches",
      category: conf.category || "ops",
      trackBacklog: conf.trackBacklog !== false,

      backlogTasks,
      incomingTasksPerHour,
      productivityPerHour: rate,

      clearWithinMinutes,
      slaMinutes: Math.max(0, Number(conf?.slaMinutes || 0) || 0),

      requiredForBacklog,
      requiredForFlow,
      requiredNow,
      recommendedNow,

      activeNow,
      plannedAssigned,
      capacityNowTasksPerHour,
      estimatedClearMinutes,

      capacityGap,
      assignmentGap,

      riskLevel:
        (Math.max(0, Number(conf?.slaMinutes || 0)) > 0 &&
          estimatedClearMinutes > 0 &&
          estimatedClearMinutes > Number(conf.slaMinutes))
          ? "high"
          : capacityGap > 0
          ? "warning"
          : "ok",
    };

    perSkill.push(rec);

    // alertes backlog / SLA
    if (rec.trackBacklog && rec.backlogTasks > 0 && rec.capacityGap > 0) {
      alerts.push({
        type: "ops_backlog_capacity_gap",
        severity: rec.capacityGap >= 2 ? "high" : "warning",
        skill: skillKey,
        message: `${rec.label}: backlog ${rec.backlogTasks} (${rec.unitLabel}) • besoin ${rec.requiredNow} • actifs ${rec.activeNow}`,
        gap: rec.capacityGap,
      });
    }

    if (rec.trackBacklog && rec.slaMinutes > 0 && rec.estimatedClearMinutes > rec.slaMinutes) {
      alerts.push({
        type: "ops_sla_risk",
        severity: rec.estimatedClearMinutes >= rec.slaMinutes * 2 ? "high" : "warning",
        skill: skillKey,
        message: `${rec.label}: SLA ${rec.slaMinutes} min risque (clear estimé ${rec.estimatedClearMinutes} min)`,
        gap: rec.estimatedClearMinutes - rec.slaMinutes,
      });
    }
  }

  // Totaux
  const tracked = perSkill.filter((x) => x.trackBacklog);
  const totalBacklog = tracked.reduce((s, x) => s + (Number(x.backlogTasks) || 0), 0);
  const totalRequiredNow = tracked.reduce((s, x) => s + (Number(x.requiredNow) || 0), 0);
  const totalActiveNow = tracked.reduce((s, x) => s + (Number(x.activeNow) || 0), 0);
  const totalCapacityGap = Math.max(0, totalRequiredNow - totalActiveNow);

  return {
    enabled: true,
    updatedAt: dlx.updatedAt || null,
    horizonMinutesDefault: horizonDefault,
    perSkill,
    alerts,
    summary: {
      skillsTracked: tracked.length,
      totalBacklog,
      totalRequiredNow,
      totalActiveNow,
      totalCapacityGap,
      alertsCount: alerts.length,
    },
  };
}

/* ---------------------------
   Main analyze
---------------------------- */
export function analyzePlanning(input = {}, options = {}) {
  const dayKeys = normalizeDayKeys(input);
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const coverageCfg = normalizeCoverageConfig(input, options);
  const requirementsByDaySlot = normalizeRequirements(input);

  // Row stats + contract deltas + cost
  const rowStats = rows.map((r) => {
    const weeklyMinutes = Number(r?.weeklyMinutes) || getWeeklyMinutes(r?.cells || {}, dayKeys);
    const contractHours = Number(r?.contractHours) || 0;
    const targetMin = contractHours * 60;
    const deltaMin = weeklyMinutes - targetMin;
    const hourlyRate = getHourlyRateForRow(r, input);
    const estimatedCost = (weeklyMinutes / 60) * hourlyRate;

    return {
      rowId: r?.id || null,
      name: r?.name || "",
      role: r?.role || "prep",
      weeklyMinutes,
      contractHours,
      targetMin,
      deltaMin,
      hourlyRate,
      estimatedCost,
    };
  });

  const warnings = [];

  for (const st of rowStats) {
    if (st.contractHours > 0 && Math.abs(st.deltaMin) > 60) {
      warnings.push({
        type: "contract_delta",
        severity: Math.abs(st.deltaMin) >= 180 ? "high" : "medium",
        staff: st.name,
        rowId: st.rowId,
        deltaMinutes: st.deltaMin,
        message: `${st.name || "Collaborateur"} : écart contrat ${st.deltaMin > 0 ? "+" : ""}${minutesToHourLabel(st.deltaMin)}`,
      });
    }
  }

  // Day summary
  const byDay = {};
  for (const dk of dayKeys) {
    let plannedCount = 0;
    let plannedMinutes = 0;
    for (const r of rows) {
      const p = parseShiftCell(r?.cells?.[dk]);
      if (p.kind === "work") {
        plannedCount += 1;
        plannedMinutes += p.durationMin || 0;
      }
    }
    byDay[dk] = {
      plannedCount,
      plannedMinutes,
      plannedHours: Math.round((plannedMinutes / 60) * 100) / 100,
    };
  }

  // Coverage needs by slot / gaps
  const needsBySlot = [];
  const coverageGaps = [];
  const coverageSummaryByDay = {};

  for (const dk of dayKeys) {
    let dayTotalNeed = 0;
    let dayTotalPlanned = 0;
    let dayTotalGap = 0;
    let daySkillGapsCount = 0;
    let dayRoleGapsCount = 0;

    for (
      let slotStart = coverageCfg.fromMin;
      slotStart < coverageCfg.toMin;
      slotStart += coverageCfg.slotMinutes
    ) {
      const slotEnd = Math.min(slotStart + coverageCfg.slotMinutes, coverageCfg.toMin);
      const req = resolveRequirementForSlot(requirementsByDaySlot, dk, slotStart, slotEnd);
      const cov = aggregateCoverageForSlot(rows, dk, slotStart);

      const totalGap = Math.max(0, (Number(req.total) || 0) - cov.plannedTotal);

      const roleGaps = Object.entries(req.roles || {}).map(([role, needed]) => {
        const roleNorm = String(role).toLowerCase();
        const neededN = Math.max(0, Number(needed) || 0);
        const planned = Number(cov.plannedRoles?.[roleNorm] || 0);
        return {
          role: roleNorm,
          needed: neededN,
          planned,
          gap: Math.max(0, neededN - planned),
        };
      });

      const skillGaps = Object.entries(req.skills || {}).map(([skill, needed]) => {
        const skillNorm = String(skill).toLowerCase();
        const neededN = Math.max(0, Number(needed) || 0);
        const planned = Number(cov.plannedSkills?.[skillNorm] || 0);
        return {
          skill: skillNorm,
          needed: neededN,
          planned,
          gap: Math.max(0, neededN - planned),
        };
      });

      const slotLabel = `${minToHHMM(slotStart)}-${minToHHMM(slotEnd)}`;

      const slotRec = {
        dayKey: dk,
        slotKey: minToHHMM(slotStart),
        slotLabel,
        slotStart: minToHHMM(slotStart), // ✅ compat autoBalance
        slotEnd: minToHHMM(slotEnd),     // ✅ compat autoBalance
        start: minToHHMM(slotStart),
        end: minToHHMM(slotEnd),

        requiredTotal: Number(req.total) || 0,
        needTotal: Number(req.total) || 0, // alias
        plannedTotal: cov.plannedTotal,
        totalGap,

        requiredRoles: req.roles || {},
        plannedRoles: cov.plannedRoles || {},
        roleGaps,

        requiredSkills: req.skills || {},
        plannedSkills: cov.plannedSkills || {},
        skillGaps,

        plannedCodes: cov.codes || {},
      };

      needsBySlot.push(slotRec);

      dayTotalNeed += slotRec.requiredTotal;
      dayTotalPlanned += slotRec.plannedTotal;
      dayTotalGap += totalGap;
      dayRoleGapsCount += roleGaps.filter((x) => x.gap > 0).length;
      daySkillGapsCount += skillGaps.filter((x) => x.gap > 0).length;

      // Gaps coverage total (1 entrée par slot si gap total)
      if (totalGap > 0) {
        coverageGaps.push({
          type: "coverage_total_gap",
          severity: totalGap >= 2 ? "high" : "warning",
          dayKey: dk,
          slotKey: slotRec.slotKey,
          slotLabel,
          slotStart: slotRec.slotStart,
          slotEnd: slotRec.slotEnd,
          requiredTotal: slotRec.requiredTotal,
          plannedTotal: slotRec.plannedTotal,
          gap: totalGap,
          message: `${String(dk).toUpperCase()} ${slotLabel} : besoin ${slotRec.requiredTotal}, planifié ${slotRec.plannedTotal}`,
        });
      }

      // Gaps compétences (1 entrée par skill en déficit)
      for (const sg of skillGaps.filter((x) => x.gap > 0)) {
        coverageGaps.push({
          type: "coverage_skill_gap",
          severity: sg.gap >= 2 ? "high" : "warning",
          dayKey: dk,
          slotKey: slotRec.slotKey,
          slotLabel,
          slotStart: slotRec.slotStart,
          slotEnd: slotRec.slotEnd,
          skill: sg.skill,
          needed: sg.needed,
          planned: sg.planned,
          gap: sg.gap,
          message: `${String(dk).toUpperCase()} ${slotLabel} : manque skill ${sg.skill} (${sg.planned}/${sg.needed})`,
        });
      }

      // Gaps rôle (facultatif, utile debug)
      for (const rg of roleGaps.filter((x) => x.gap > 0)) {
        coverageGaps.push({
          type: "coverage_role_gap",
          severity: rg.gap >= 2 ? "high" : "warning",
          dayKey: dk,
          slotKey: slotRec.slotKey,
          slotLabel,
          slotStart: slotRec.slotStart,
          slotEnd: slotRec.slotEnd,
          role: rg.role,
          needed: rg.needed,
          planned: rg.planned,
          gap: rg.gap,
          message: `${String(dk).toUpperCase()} ${slotLabel} : manque rôle ${rg.role} (${rg.planned}/${rg.needed})`,
        });
      }
    }

    coverageSummaryByDay[dk] = {
      totalNeed: dayTotalNeed,
      totalPlanned: dayTotalPlanned,
      totalGap: dayTotalGap,
      roleGapsCount: dayRoleGapsCount,
      skillGapsCount: daySkillGapsCount,
    };
  }

  // Add compact gap warnings (top)
  for (const g of coverageGaps.slice(0, 20)) {
    warnings.push({
      type: g.type || "coverage_gap",
      severity: g.severity || "warning",
      dayKey: g.dayKey,
      slotKey: g.slotKey,
      message: g.message,
      gap: g.gap,
      skill: g.skill,
      role: g.role,
    });
  }

  // Cost summary
  const estimatedCost = rowStats.reduce((s, r) => s + (Number(r.estimatedCost) || 0), 0);
  const estimatedCostByRole = {};
  for (const r of rowStats) {
    const role = String(r.role || "prep").toLowerCase();
    estimatedCostByRole[role] = (estimatedCostByRole[role] || 0) + (Number(r.estimatedCost) || 0);
  }

  const totalPlannedMinutes = rowStats.reduce((s, r) => s + (Number(r.weeklyMinutes) || 0), 0);
  const totalTargetMinutes = rowStats.reduce((s, r) => s + (Number(r.targetMin) || 0), 0);

  const skillCoverageGapsCount = coverageGaps.filter((g) => g.type === "coverage_skill_gap").length;
  const roleCoverageGapsCount = coverageGaps.filter((g) => g.type === "coverage_role_gap").length;
  const totalCoverageGapsCount = coverageGaps.length;

  const coverageSummary = {
    byDay: coverageSummaryByDay,
    totals: {
      totalNeed: Object.values(coverageSummaryByDay).reduce((s, d) => s + (d.totalNeed || 0), 0),
      totalPlanned: Object.values(coverageSummaryByDay).reduce((s, d) => s + (d.totalPlanned || 0), 0),
      totalGap: Object.values(coverageSummaryByDay).reduce((s, d) => s + (d.totalGap || 0), 0),
      skillGapsCount: Object.values(coverageSummaryByDay).reduce((s, d) => s + (d.skillGapsCount || 0), 0),
      roleGapsCount: Object.values(coverageSummaryByDay).reduce((s, d) => s + (d.roleGapsCount || 0), 0),
    },
  };

  // Ops / DLX live analysis
  const ops = analyzeOpsDlx(input, rows);

  // Propager les alertes ops dans warnings (compact)
  for (const a of (ops?.alerts || []).slice(0, 20)) {
    warnings.push({
      type: a.type || "ops_alert",
      severity: a.severity || "warning",
      skill: a.skill,
      message: a.message,
      gap: a.gap,
    });
  }

  return {
    summary: {
      staffCount: rows.length,
      warningsCount: warnings.length,

      totalPlannedMinutes,
      totalTargetMinutes,
      totalDeltaMinutes: totalPlannedMinutes - totalTargetMinutes,

      // ✅ aliases pour concordance écrans
      estimatedCost,
      estimatedPayrollCost: estimatedCost,
      estimatedCostByRole,

      coverageGapCount: totalCoverageGapsCount,   // ancien nom
      coverageGapsCount: totalCoverageGapsCount,  // nom utilisé par PlanningRH/autoBalance
      skillCoverageGapsCount,
      roleCoverageGapsCount,

      slotsAnalyzed: needsBySlot.length,

      // Ops DLX
      opsAlertsCount: ops?.summary?.alertsCount || 0,
      opsTotalBacklog: ops?.summary?.totalBacklog || 0,
      opsTotalRequiredNow: ops?.summary?.totalRequiredNow || 0,
      opsTotalActiveNow: ops?.summary?.totalActiveNow || 0,
      opsTotalCapacityGap: ops?.summary?.totalCapacityGap || 0,
    },

    rowStats,
    byDay,
    warnings,

    // coverage / besoins
    needsBySlot,
    coverageGaps,
    coverageSummary,

    // coûts (format attendu par PlanningRH)
    costs: {
      totalEstimated: estimatedCost,
      byRole: estimatedCostByRole,
      currency: "EUR",
    },

    // pilotage opérationnel live
    ops,
  };
}

// ----- aliases rétrocompat
export const analyzeWeekPlanning = analyzePlanning;
export const getPlanningAnalysis = analyzePlanning;
export const computePlanningAnalysis = analyzePlanning;

export default analyzePlanning;