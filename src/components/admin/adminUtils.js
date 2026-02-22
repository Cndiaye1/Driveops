// src/components/admin/adminUtils.js
export function shortUuid(u) {
  if (!u) return "";
  return `${u.slice(0, 8)}…${u.slice(-6)}`;
}

export function normalizeRole(r) {
  return String(r || "").trim().toLowerCase();
}
