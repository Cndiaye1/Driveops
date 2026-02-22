// src/components/admin/MemberRow.jsx
import React from "react";
import { Button, Field, Select } from "./AdminPrimitives";
import { ui, theme, roleBadgeStyle } from "./adminTheme";
import { shortUuid, normalizeRole } from "./adminUtils";

export default function MemberRow({
  m,
  sessionUserId,
  showTechInfo,
  canManage,
  rowBusy,
  actionLoadingType,
  isLastAdmin,
  onUpdateRole,
  onResetPin,
  onRemove,
}) {
  const uid = m.user_id;
  const role = normalizeRole(m.role);
  const self = uid === sessionUserId;

  const disableDelete = !canManage || rowBusy || self || isLastAdmin;
  const disableRole = !canManage || rowBusy;
  const disablePin = !canManage || rowBusy;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
        padding: 12,
        opacity: rowBusy ? 0.72 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Bloc identité */}
        <div style={{ minWidth: 260, flex: "1 1 320px" }}>
          <div style={{ ...ui.row, gap: 8 }}>
            <div
              title={m.member_code || uid}
              style={{
                fontWeight: 900,
                fontSize: 15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {m.member_code ? m.member_code : shortUuid(uid)}
            </div>

            <span style={roleBadgeStyle(role)}>{role || "user"}</span>

            {self ? <span style={ui.chip}>Toi</span> : null}
          </div>

          <div style={{ ...ui.tiny, marginTop: 6 }}>
            {m.full_name ? (
              <>
                Nom: <b style={{ color: theme.text }}>{m.full_name}</b> ·{" "}
              </>
            ) : null}
            Créé: {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
          </div>

          {showTechInfo ? (
            <div style={{ ...ui.tiny, marginTop: 4 }}>
              user_id: <code>{shortUuid(uid)}</code>
            </div>
          ) : null}
        </div>

        {/* Bloc rôle */}
        <div style={{ minWidth: 180, flex: "0 1 220px" }}>
          <Field label={<span style={{ ...ui.tiny, fontWeight: 800 }}>Rôle</span>}>
            <Select
              value={role}
              disabled={disableRole}
              onChange={(e) => onUpdateRole(uid, e.target.value)}
              title={!canManage ? "Accès admin requis" : ""}
            >
              <option value="user">user</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </Select>
          </Field>

          {isLastAdmin ? (
            <div style={{ fontSize: 12, marginTop: 6, color: "#ffe09a" }}>
              ⚠️ Dernier admin du site
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div style={{ ...ui.row, justifyContent: "flex-end", flex: "1 1 240px" }}>
          <Button disabled={disablePin} onClick={() => onResetPin(uid, m.member_code)}>
            {actionLoadingType === "pin" ? "..." : "Réinitialiser PIN"}
          </Button>

          <Button
            variant="danger"
            disabled={disableDelete}
            onClick={() => onRemove(uid, m.member_code)}
            title={self ? "Impossible de te supprimer toi-même" : ""}
          >
            {actionLoadingType === "delete" ? "..." : "Supprimer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
