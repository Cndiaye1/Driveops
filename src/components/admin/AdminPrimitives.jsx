// src/components/admin/AdminPrimitives.jsx
import React from "react";
import { theme, ui } from "./adminTheme";

export function Card({ title, subtitle, right, children, style }) {
  return (
    <div style={{ ...ui.card, ...style }}>
      {(title || subtitle || right) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div>
            {title ? <h3 style={{ ...ui.h2 }}>{title}</h3> : null}
            {subtitle ? <div style={{ ...ui.tiny, marginTop: 4 }}>{subtitle}</div> : null}
          </div>
          {right ? <div>{right}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({ variant = "default", style, disabled, children, ...props }) {
  let base = ui.button;
  if (variant === "primary") base = ui.buttonPrimary;
  if (variant === "danger") base = ui.buttonDanger;

  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        ...base,
        ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : null),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Input(props) {
  return <input {...props} style={{ ...ui.input, ...(props.style || {}) }} />;
}

export function Select(props) {
  return <select {...props} style={{ ...ui.input, ...(props.style || {}) }} />;
}

export function Field({ label, children }) {
  return (
    <label style={ui.label}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Banner({ type = "info", children }) {
  let style = {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    color: theme.text,
  };

  if (type === "error") {
    style = {
      ...style,
      border: "1px solid rgba(255,90,90,0.35)",
      background: "rgba(255,90,90,0.08)",
      color: "#ffe5e5",
    };
  }

  if (type === "success") {
    style = {
      ...style,
      border: "1px solid rgba(102,220,140,0.35)",
      background: "rgba(102,220,140,0.08)",
      color: "#e0ffe9",
    };
  }

  if (type === "warning") {
    style = {
      ...style,
      border: "1px solid rgba(255,205,92,0.35)",
      background: "rgba(255,205,92,0.08)",
      color: "#fff1c6",
    };
  }

  return <div style={style}>{children}</div>;
}

export function StatCard({ label, value, hint }) {
  return (
    <div style={ui.kpi}>
      <div style={{ ...ui.tiny, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{value}</div>
      {hint ? <div style={{ ...ui.tiny, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}
