// src/utils/planningRules.js

export const DAY_KEYS_UI_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABELS_UI = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function dayLabel(dayKey) {
  const idx = DAY_KEYS_UI_ORDER.indexOf(dayKey);
  return idx >= 0 ? DAY_LABELS_UI[idx] : String(dayKey || "");
}

// Blocs de couverture par défaut (v1)
// -> Ajustables par site plus tard (Drive petit/grand, samedi renforcé, etc.)
export const DEFAULT_COVERAGE_BLOCKS = [
  { id: "morning", label: "Matin", start: "06:00", end: "10:00", minStaff: 2 },
  { id: "midday", label: "Midi", start: "10:00", end: "14:00", minStaff: 3 },
  { id: "afternoon", label: "Après-midi", start: "14:00", end: "18:00", minStaff: 2 },
  { id: "evening", label: "Soir", start: "18:00", end: "21:30", minStaff: 2 },
];

// Paramètres globaux (v1)
export const DEFAULT_PLANNING_RULES = {
  contractToleranceMinutes: 15,   // tolérance écart contrat
  coverageBlocks: DEFAULT_COVERAGE_BLOCKS,

  // Préparation sprint suivants
  maxDailyAmplitudeMinutes: null, // ex: 10h = 600 (si activé)
  minRestBetweenDaysMinutes: null, // ex: 11h = 660 (si activé)
  maxConsecutiveDays: null,        // ex: 6 (si activé)
};

export function mergePlanningRules(customRules = {}) {
  const base = { ...DEFAULT_PLANNING_RULES, ...(customRules || {}) };

  // coverageBlocks : sanitation légère
  const blocks = Array.isArray(base.coverageBlocks) ? base.coverageBlocks : DEFAULT_COVERAGE_BLOCKS;
  base.coverageBlocks = blocks
    .map((b, idx) => ({
      id: String(b?.id || `block_${idx}`),
      label: String(b?.label || `Bloc ${idx + 1}`),
      start: String(b?.start || "00:00"),
      end: String(b?.end || "00:00"),
      minStaff: Math.max(0, Number(b?.minStaff) || 0),
    }))
    .filter(Boolean);

  base.contractToleranceMinutes = Math.max(0, Number(base.contractToleranceMinutes) || 0);

  return base;
}

export function severityTone(severity) {
  if (severity === "high") {
    return {
      color: "#fecaca",
      border: "1px solid rgba(239,68,68,0.30)",
      bg: "rgba(239,68,68,0.08)",
    };
  }
  if (severity === "medium") {
    return {
      color: "#fde68a",
      border: "1px solid rgba(245,158,11,0.28)",
      bg: "rgba(245,158,11,0.08)",
    };
  }
  return {
    color: "#bfdbfe",
    border: "1px solid rgba(59,130,246,0.24)",
    bg: "rgba(59,130,246,0.08)",
  };
}

export function severityRank(severity) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}