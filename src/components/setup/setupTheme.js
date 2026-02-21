export const setupUi = {
  surface: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  section: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 14,
  },
  label: {
    fontSize: 12,
    opacity: 0.78,
    marginBottom: 4,
    display: "block",
    fontWeight: 600,
    letterSpacing: "0.2px",
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
  btn: {
    background: "#1f2937",
    color: "#f9fafb",
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
  btnGhost: {
    background: "rgba(255,255,255,0.03)",
    color: "#f3f4f6",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 600,
  },
  smallPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    fontSize: 12,
    opacity: 0.95,
  },
  summaryCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
  },
};

export function getApiBadgeColor(apiStatus) {
  return apiStatus === "error"
    ? "#fca5a5"
    : apiStatus === "offline"
    ? "#fcd34d"
    : apiStatus === "pushed" || apiStatus === "pulled"
    ? "#86efac"
    : "#cbd5e1";
}
