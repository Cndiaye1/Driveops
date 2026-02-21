import React from "react";

export default function SetupHeader({
  ui,
  isServiceRunning,
  setupStep,
  siteDraft,
  setSiteDraft,
  normUpper,
  commitSiteCode,
  siteCode,
  dayDate,
  setDayDate,
  adminLoading,
  isAdmin,
  goToAdmin,
  goToCockpitSafe,
  handleLogout,
  apiStatus,
  apiBadgeColor,
  apiError,
  showCfgStatus,
  cfgStatus,
  cfgError,
  role,
}) {
  const inputStyle = ui.input;

  return (
    <div className="setupHeader">
      <div>
        <h1 style={{ marginBottom: 6 }}>🚗 DriveOps — Configuration de la journée</h1>
        {isServiceRunning ? (
          <p className="muted" style={{ marginTop: 0 }}>
            ✅ Service en cours — tu peux modifier puis revenir au cockpit.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Étape {setupStep}/2 — Équipe du jour puis placement initial.
          </p>
        )}
      </div>

      <div
        className="setupRight"
        style={{
          display: "flex",
          gap: 10,
          alignItems: "end",
          flexWrap: "wrap",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 10,
        }}
      >
        {/* Site code (draft + valider) */}
        <div>
          <label className="muted small" style={ui.label}>
            Site code
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={siteDraft}
              onChange={(e) => setSiteDraft(normUpper(e.target.value))}
              onBlur={commitSiteCode}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSiteCode();
              }}
              placeholder="MELUN"
              style={{ ...inputStyle, minWidth: 120 }}
            />
            <button
              className="btn ghost"
              onClick={commitSiteCode}
              title="Valider le site"
              style={ui.btnGhost}
              type="button"
            >
              ✔
            </button>
          </div>
          <div className="muted small" style={{ opacity: 0.7, marginTop: 6 }}>
            Stocké en base: <b>{(siteCode || "").toLowerCase() || "—"}</b>
          </div>
        </div>

        <div>
          <label className="muted small" style={ui.label}>
            Date
          </label>
          <input
            type="date"
            value={dayDate}
            onChange={(e) => setDayDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {adminLoading ? (
          <button className="btn ghost" disabled title="Vérification…" style={ui.btnGhost}>
            🛠 Admin…
          </button>
        ) : isAdmin ? (
          <button
            className="btn ghost"
            onClick={goToAdmin}
            title="Aller sur la page Admin"
            style={ui.btnGhost}
            type="button"
          >
            🛠 Admin
          </button>
        ) : null}

        {isServiceRunning && (
          <button
            className="btn ghost"
            onClick={goToCockpitSafe}
            title="Retour cockpit"
            style={ui.btnGhost}
            type="button"
          >
            🧭 Cockpit
          </button>
        )}

        <button
          className="btn ghost"
          onClick={handleLogout}
          title="Se déconnecter"
          style={ui.btnGhost}
          type="button"
        >
          🚪 Déconnexion
        </button>

        <div
          className="muted small"
          style={{
            minWidth: 260,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.12)",
          }}
        >
          <div>
            API: <b style={{ color: apiBadgeColor }}>{apiStatus}</b>
            {apiError ? <span style={{ opacity: 0.9 }}> — {apiError}</span> : null}
          </div>

          {showCfgStatus ? (
            <div style={{ marginTop: 2, opacity: 0.92 }}>
              Config site: <b>{cfgStatus || "—"}</b>
              {cfgError ? <span style={{ opacity: 0.9 }}> — {cfgError}</span> : null}
            </div>
          ) : null}

          <div style={{ opacity: 0.85, marginTop: 2 }}>
            Rôle site: <b>{role || "—"}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
