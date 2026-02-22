// src/components/admin/AdminMemberForm.jsx
import React from "react";
import { Card, Button, Field, Input, Select } from "./AdminPrimitives";

export default function AdminMemberForm({
  canManage,
  targetSiteLabel,
  normalizedSite,
  form,
  setForm,
  onSubmit,
  loading,
}) {
  return (
    <Card
      title="Créer / mettre à jour un membre (CODE + PIN)"
      subtitle={
        <>
          Site cible: <b>{targetSiteLabel}</b>
          {normalizedSite && targetSiteLabel !== normalizedSite ? (
            <span> · ⚠️ différent du site de l’app</span>
          ) : null}
        </>
      }
      style={{
        marginTop: 14,
        opacity: canManage ? 1 : 0.6,
        pointerEvents: canManage ? "auto" : "none",
      }}
    >
      <form onSubmit={onSubmit}>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <Field label="CODE">
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="ex: p01 / bamba / cheikh"
            />
          </Field>

          <Field label="PIN">
            <Input
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              placeholder="ex: 1234"
            />
          </Field>

          <Field label="Rôle">
            <Select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="user">user</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </Select>
          </Field>

          <Field label="Nom (optionnel)">
            <Input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="ex: Bamba"
            />
          </Field>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          style={{ marginTop: 12, width: "100%" }}
        >
          {loading ? "En cours..." : "Créer / Mettre à jour"}
        </Button>
      </form>
    </Card>
  );
}
