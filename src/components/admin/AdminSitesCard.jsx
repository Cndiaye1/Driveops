// src/components/admin/AdminSitesCard.jsx
import React from "react";
import { Card, Button, Field, Input, Select } from "./AdminPrimitives";
import { ui } from "./adminTheme";

export default function AdminSitesCard({
  isGlobalAdmin,
  sites,
  sitesLoading,
  targetSiteLabel,
  setAdminSite,
  loadSites,
  loadMembers,
  setSiteCode,
  membersLoading,
  siteForm,
  setSiteForm,
  siteCreating,
  createSite,
}) {
  return (
    <Card
      title="Sites"
      subtitle="Choisis le site cible pour administrer les membres. Tu peux aussi l’appliquer à l’app (Setup/Cockpit)."
      style={{ marginTop: 14 }}
      right={
        <Button onClick={loadSites} disabled={sitesLoading}>
          {sitesLoading ? "Chargement..." : "Actualiser les sites"}
        </Button>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        <Field label="Site cible (Admin)">
          {isGlobalAdmin && sites.length > 0 ? (
            <Select
              value={targetSiteLabel}
              onChange={(e) =>
                setAdminSite(String(e.target.value || "").trim().toLowerCase())
              }
            >
              {sites.map((s) => {
                const code = String(s.site_code || s.code || "")
                  .trim()
                  .toLowerCase();
                const name = String(s.name || "").trim();

                return (
                  <option key={code} value={code}>
                    {code}
                    {name ? ` — ${name}` : ""}
                  </option>
                );
              })}
            </Select>
          ) : (
            <div
              style={{
                ...ui.input,
                display: "flex",
                alignItems: "center",
                minHeight: 40,
                opacity: 0.92,
              }}
            >
              <b>{targetSiteLabel}</b>
              <span style={{ ...ui.tiny, marginLeft: 8 }}>
                {isGlobalAdmin
                  ? "Aucun site renvoyé"
                  : "Mode mono-site (list-sites indisponible / non autorisé)"}
              </span>
            </div>
          )}
        </Field>

        <div style={ui.row}>
          <Button
            onClick={loadMembers}
            disabled={membersLoading || !targetSiteLabel || targetSiteLabel === "—"}
          >
            {membersLoading ? "Chargement..." : "Voir membres"}
          </Button>

          <Button
            variant="primary"
            onClick={() => setSiteCode?.(targetSiteLabel)}
            disabled={!targetSiteLabel || targetSiteLabel === "—"}
            title="Mettre ce site comme site de l’app (Setup/Cockpit)"
          >
            Utiliser dans l’app
          </Button>
        </div>
      </div>

      {isGlobalAdmin ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Créer un site</div>

            <form onSubmit={createSite}>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  alignItems: "end",
                }}
              >
                <Field label="Code site">
                  <Input
                    value={siteForm.code}
                    onChange={(e) =>
                      setSiteForm((s) => ({ ...s, code: e.target.value }))
                    }
                    placeholder="ex: melun"
                  />
                </Field>

                <Field label="Nom (optionnel)">
                  <Input
                    value={siteForm.name}
                    onChange={(e) =>
                      setSiteForm((s) => ({ ...s, name: e.target.value }))
                    }
                    placeholder="ex: Melun"
                  />
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={siteCreating}
                  style={{ height: 40 }}
                >
                  {siteCreating ? "Création..." : "Créer"}
                </Button>
              </div>
            </form>

            <div style={{ ...ui.tiny, marginTop: 8 }}>
              Si <code>/api/admin/site-create</code> n’existe pas encore, cette section restera sans effet.
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
