// src/components/cockpit/posteMeta.js

export const POSTE_META = {
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

export function posteMeta(poste) {
  const key = normalizePoste(poste);
  if (!key) return { icon: "📍", label: "" };

  if (POSTE_META[key]) return POSTE_META[key];

  if (key === "FLEG" || key === "SURG") return POSTE_META["FLEG/SURG"];

  return { icon: "📍", label: key };
}
