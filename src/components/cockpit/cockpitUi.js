// src/components/cockpit/cockpitUi.js

// ✅ Table d'icônes alignée sur les postes du store
const POSTE_META = {
  ACCUEIL: { icon: "🛎️", label: "ACCUEIL" },
  PGC: { icon: "📦", label: "PGC" },
  FS: { icon: "🏷️", label: "FS" },
  LIV: { icon: "🚚", label: "LIV" },
  MES: { icon: "📥", label: "MES" }, // Mise en stock
  LAD: { icon: "🏠", label: "LAD" }, // Livraison à domicile
  "FLEG/SURG": { icon: "🥬🧊", label: "FLEG/SURG" },
  RE: { icon: "♻️", label: "RE" }, // Réceptions / retours
  NET: { icon: "🧽", label: "NET" }, // Nettoyage
  PAUSE: { icon: "☕", label: "PAUSE" },
};

export function normalizePoste(p) {
  return (p || "").trim().toUpperCase();
}

// ✅ gère aussi les cas "FLEG" / "SURG" -> "FLEG/SURG"
export function posteMeta(poste) {
  const key = normalizePoste(poste);
  if (!key) return { icon: "📍", label: "" };

  if (POSTE_META[key]) return POSTE_META[key];
  if (key === "FLEG" || key === "SURG") return POSTE_META["FLEG/SURG"];

  return { icon: "📍", label: key };
}

export function getCockpitUi() {
  return {
    select: {
      width: "100%",
      background: "#0f172a",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    option: {
      backgroundColor: "#0f172a",
      color: "#e5e7eb",
    },
    input: {
      width: "100%",
      background: "#0f172a",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      boxSizing: "border-box",
    },
    btnGhost: {
      background: "rgba(255,255,255,0.03)",
      color: "#f3f4f6",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 12px",
      cursor: "pointer",
      fontWeight: 600,
    },
    btnPrimary: {
      background: "linear-gradient(180deg, #ef4444, #dc2626)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow: "0 8px 18px rgba(220,38,38,0.25)",
    },
    panel: {
      border: "1px solid rgba(255,255,255,0.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
      borderRadius: 14,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    },
    topStat: {
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      borderRadius: 999,
      padding: "8px 12px",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    },
    softRow: {
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.02)",
      borderRadius: 12,
      padding: 10,
    },
  };
}
