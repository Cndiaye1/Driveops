// src/components/cockpit/CockpitBlockModal.jsx
import React from "react";
import { toH } from "../../utils/blocks";

export default function CockpitBlockModal({
  open,
  blocks,
  blockDraft,
  setBlockDraft,
  onClose,
  onApply,
  ui,
}) {
  if (!open) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard card" onClick={(e) => e.stopPropagation()} style={ui.panel}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0 }}>⏱️ Forcer un bloc</h2>
          <button
            className="btn ghost"
            onClick={onClose}
            title="Fermer"
            style={ui.btnGhost}
            type="button"
          >
            ✕
          </button>
        </div>

        <p className="muted" style={{ marginTop: 8 }}>
          Choisis le bloc à afficher. Cela désactive la <b>sync sur l’heure du PC</b>.
        </p>

        <div className="row" style={{ marginTop: 10 }}>
          <select value={blockDraft} onChange={(e) => setBlockDraft(e.target.value)} style={ui.select}>
            {blocks.map((b) => (
              <option key={b.id} value={b.id} style={ui.option}>
                {toH(b.start)}–{toH(b.end)}
              </option>
            ))}
          </select>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose} style={ui.btnGhost} type="button">
            Annuler
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn primary" onClick={onApply} style={ui.btnPrimary} type="button">
            ✅ Valider
          </button>
        </div>

        <div className="muted small" style={{ marginTop: 10, opacity: 0.75 }}>
          Astuce : recoche “Sync sur l’heure du PC” dans Options pour revenir en automatique.
        </div>
      </div>
    </div>
  );
}
