import React from "react";

export default function SetupSummaryCard({
  ui,
  siteCode,
  dayDate,
  coordinator,
  dayStaffCount,
  pauseWaveSize,
}) {
  return (
    <div className="card" style={ui.summaryCard}>
      <h2 style={{ marginTop: 0 }}>Résumé</h2>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        <div style={ui.smallPill}>
          🏪 Site: <b>{(siteCode || "—").toUpperCase()}</b>
        </div>
        <div style={ui.smallPill}>
          📅 Date: <b>{dayDate}</b>
        </div>
        <div style={ui.smallPill}>
          👤 Coordinateur: <b>{coordinator || "—"}</b>
        </div>
        <div style={ui.smallPill}>
          👥 Préparateurs: <b>{dayStaffCount}</b>
        </div>
        <div style={ui.smallPill}>
          ☕ Vague pause: <b>{pauseWaveSize || 1}</b>
        </div>
      </div>
    </div>
  );
}
