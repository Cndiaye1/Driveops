// api/admin/update-config.js
const {
  json, handleCors, supabaseAdmin, requireUser, readBody, getSiteCode, ensureAdminOrBootstrap, normalizeSiteCode
} = require("./_lib");

function uniqUpper(arr) {
  const out = [];
  const set = new Set();
  (arr || []).forEach((x) => {
    const v = String(x || "").trim().toUpperCase();
    if (!v) return;
    if (set.has(v)) return;
    set.add(v);
    out.push(v);
  });
  return out;
}

function uniqHours(arr) {
  const out = [];
  const set = new Set();
  (arr || []).forEach((x) => {
    const v = String(x || "").trim();
    // format HH:MM
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    if (set.has(v)) return;
    set.add(v);
    out.push(v);
  });
  return out;
}

module.exports = async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);
    const body = await readBody(req);

    const siteCode = normalizeSiteCode(getSiteCode(req, body));
    if (!siteCode) return json(res, 400, { ok: false, error: "siteCode required" });

    await ensureAdminOrBootstrap(sb, siteCode, user.id);

    const patch = body.config || body;

    const preparateurs = uniqUpper(patch.preparateurs || patch.preparateursList);
    const coordos = uniqUpper(patch.coorgos || patch.coordos || patch.coordosList);
    const postes = uniqUpper(patch.postes);
    const horaires = uniqHours(patch.horaires);

    const update = {
      site_code: siteCode,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    if (preparateurs) update.preparateurs = preparateurs;
    if (coordos) update.coordos = coordos;
    if (postes) update.postes = postes;
    if (horaires && horaires.length >= 2) update.horaires = horaires;

    // settings
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    if (patch.rotationMinutes != null) update.rotation_minutes = num(patch.rotationMinutes, 120);
    if (patch.rotationWarnMinutes != null) update.rotation_warn_minutes = num(patch.rotationWarnMinutes, 10);
    if (patch.pauseAfterMinutes != null) update.pause_after_minutes = num(patch.pauseAfterMinutes, 180);
    if (patch.pauseDurationMinutes != null) update.pause_duration_minutes = num(patch.pauseDurationMinutes, 30);
    if (patch.pauseWaveSize != null) update.pause_wave_size = num(patch.pauseWaveSize, 1);
    if (patch.syncBlocksToSystemClock != null) update.sync_blocks_to_system_clock = !!patch.syncBlocksToSystemClock;

    const r = await sb.from("drive_site_config").upsert(update, { onConflict: "site_code" }).select("*").single();
    if (r.error) throw r.error;

    return json(res, 200, { ok: true, config: r.data });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e?.message || String(e) });
  }
};
