// src/components/admin/adminTheme.js
export const theme = {
  radius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  cardBg:
    "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))",
  inputBg: "rgba(0,0,0,0.18)",
  text: "#f5f7ff",
  muted: "rgba(245,247,255,0.72)",
  tiny: "rgba(245,247,255,0.62)",
  shadow: "0 10px 30px rgba(0,0,0,0.18)",
};

export const ui = {
  page: {
    padding: 16,
    maxWidth: 1120,
    margin: "0 auto",
    color: theme.text,
  },
  card: {
    borderRadius: theme.radius,
    border: theme.border,
    background: theme.cardBg,
    boxShadow: theme.shadow,
    padding: 14,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  input: {
    width: "100%",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: theme.inputBg,
    color: theme.text,
    padding: "10px 12px",
    minHeight: 40,
    boxSizing: "border-box",
    outline: "none",
  },
  label: {
    display: "grid",
    gap: 6,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 700,
  },
  button: {
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: theme.text,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 700,
    minHeight: 38,
  },
  buttonPrimary: {
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05))",
    color: theme.text,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 800,
    minHeight: 38,
  },
  buttonDanger: {
    borderRadius: 10,
    border: "1px solid rgba(255,90,90,0.35)",
    background: "rgba(255,90,90,0.10)",
    color: "#ffd9d9",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 700,
    minHeight: 38,
  },
  h2: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 0.2,
  },
  tiny: {
    color: theme.tiny,
    fontSize: 12,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    fontSize: 12,
    fontWeight: 800,
  },
  kpi: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(255,255,255,0.02)",
    padding: 12,
    minWidth: 140,
    flex: "1 1 160px",
  },
};

export function roleBadgeStyle(role) {
  const r = String(role || "").trim().toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: theme.text,
    textTransform: "lowercase",
  };

  if (r === "admin") {
    return {
      ...base,
      border: "1px solid rgba(102, 220, 140, 0.35)",
      background: "rgba(102, 220, 140, 0.10)",
      color: "#b7ffd1",
    };
  }
  if (r === "manager") {
    return {
      ...base,
      border: "1px solid rgba(255, 205, 92, 0.35)",
      background: "rgba(255, 205, 92, 0.10)",
      color: "#ffe09a",
    };
  }

  return base;
}
