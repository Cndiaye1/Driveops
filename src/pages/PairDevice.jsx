// src/pages/PairDevice.jsx
import React, { useState } from "react";
import { pairDevice } from "../services/deviceApi";

export default function PairDevice({ defaultSite = "MELUN", onPaired }) {
  const [siteCode, setSiteCode] = useState(defaultSite);
  const [label, setLabel] = useState("TABLETTE");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const sc = await pairDevice(siteCode, label);
      onPaired?.(sc);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <h1>🔗 Lier l’appareil</h1>
        <p className="muted">
          À faire une seule fois sur cette tablette/téléphone. (Ensuite, le site est mémorisé.)
        </p>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <label className="muted small">Site code</label>
            <input value={siteCode} onChange={(e) => setSiteCode(e.target.value)} placeholder="MELUN" />
          </div>

          <div style={{ minWidth: 260 }}>
            <label className="muted small">Nom appareil</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="TABLETTE SALLE" />
          </div>

          <button className="btn primary" disabled={loading} onClick={submit}>
            {loading ? "..." : "✅ Valider"}
          </button>
        </div>

        {err ? <div className="card callout warn" style={{ marginTop: 12 }}>{err}</div> : null}
      </div>
    </div>
  );
}
