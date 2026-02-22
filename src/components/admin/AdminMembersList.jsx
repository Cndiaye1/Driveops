// src/components/admin/AdminMembersList.jsx
import React from "react";
import { Card, Button, Input } from "./AdminPrimitives";
import { ui } from "./adminTheme";
import MemberRow from "./MemberRow";

export default function AdminMembersList({
  targetSiteLabel,
  adminCount,
  members,
  filtered,
  q,
  setQ,
  loadMembers,
  membersLoading,
  actionLoading,
  sessionUserId,
  showTechInfo,
  canManage,
  isLastAdmin,
  updateRole,
  resetPin,
  removeMember,
}) {
  return (
    <Card
      title="Membres du site"
      subtitle={`Site: ${targetSiteLabel} · Admins: ${adminCount} · Total: ${members?.length || 0}`}
      style={{ marginTop: 14 }}
      right={
        <div style={ui.row}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Recherche (code / rôle / nom)…"
            style={{ minWidth: 260 }}
          />
          <Button onClick={loadMembers} disabled={membersLoading}>
            {membersLoading ? "..." : "Rafraîchir"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {(filtered || []).map((m) => {
          const uid = m.user_id;
          const rowBusy = !!actionLoading[uid];

          return (
            <MemberRow
              key={`${m.site_code}:${uid}`}
              m={m}
              sessionUserId={sessionUserId}
              showTechInfo={showTechInfo}
              canManage={canManage}
              rowBusy={rowBusy}
              actionLoadingType={actionLoading[uid]}
              isLastAdmin={isLastAdmin(uid)}
              onUpdateRole={updateRole}
              onResetPin={resetPin}
              onRemove={removeMember}
            />
          );
        })}

        {!membersLoading && (!filtered || filtered.length === 0) && (
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.02)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 900 }}>Aucun membre trouvé</div>
            <div style={{ ...ui.tiny, marginTop: 4 }}>
              Vérifie le site cible, la recherche, ou crée un membre ci-dessus.
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
