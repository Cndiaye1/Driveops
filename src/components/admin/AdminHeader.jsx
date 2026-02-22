// src/components/admin/AdminHeader.jsx
import React from "react";
import { Card, Button, StatCard } from "./AdminPrimitives";
import { ui, theme, roleBadgeStyle } from "./adminTheme";
import { shortUuid } from "./adminUtils";

export default function AdminHeader({
  normalizedSite,
  memberRole,
  isGlobalAdmin,
  targetSiteLabel,
  membersCount,
  adminCount,
  sitesCount,
  canManage,
  sessionInfo,
  API_BASE,
  showTechInfo,
  setShowTechInfo,
  onGoSetup,
  onGoCockpit,
  onLogout,
}) {
  return (
    <Card
      title="🛠️ Administration DriveOps"
      subtitle="Gestion des membres (CODE + PIN), rôles et sites (multi-site si endpoints globaux disponibles)."
      right={
        <div style={ui.row}>
          <Button onClick={onGoSetup}>← Setup</Button>
          <Button onClick={onGoCockpit}>Cockpit</Button>
          <Button variant="danger" onClick={onLogout}>
            Déconnexion
          </Button>
        </div>
      }
    >
      <div style={{ ...ui.row, marginBottom: 12 }}>
        <span style={ui.chip}>
          Site app: <b>{normalizedSite || "—"}</b>
        </span>

        <span style={roleBadgeStyle(memberRole || "—")}>
          Rôle: {memberRole || "—"}
        </span>

        {isGlobalAdmin ? <span style={ui.chip}>🌍 Global admin</span> : null}

        <span style={ui.chip}>
          Site cible: <b>{targetSiteLabel}</b>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        <StatCard label="Membres" value={membersCount || 0} hint="site cible" />
        <StatCard label="Admins" value={adminCount || 0} hint="sur le site cible" />
        <StatCard
          label="Sites détectés"
          value={sitesCount || 0}
          hint={isGlobalAdmin ? "multi-site" : "mono-site"}
        />
        <StatCard
          label="Mode"
          value={isGlobalAdmin ? "Global" : "Site"}
          hint={canManage ? "gestion autorisée" : "accès limité"}
        />
      </div>

      <details
        style={{
          marginTop: 12,
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
          padding: "8px 10px",
        }}
        open={showTechInfo}
        onToggle={(e) => setShowTechInfo(Boolean(e.currentTarget.open))}
      >
        <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 13 }}>
          Informations techniques {showTechInfo ? "▲" : "▼"}
        </summary>

        <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
          <div style={ui.tiny}>
            Session: <b style={{ color: theme.text }}>{sessionInfo.email || "—"}</b>
            {sessionInfo.id ? (
              <>
                {" "}
                · ID: <code>{shortUuid(sessionInfo.id)}</code>
              </>
            ) : null}
          </div>

          <div style={ui.tiny}>
            API base: <code>{API_BASE || "(same origin)"}</code>
          </div>
        </div>
      </details>
    </Card>
  );
}
