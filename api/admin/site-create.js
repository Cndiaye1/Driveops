// api/admin/create-site.js
const {
  json, handleCors, supabaseAdmin, requireUser, isGlobalAdmin, normalizeSiteCode, readBody
} = require("./_lib");

const DEFAULT = {
  preparateurs: [],
  coordos: [],
  postes: ["PGC","FS","LIV","MES","LAD","FLEG/SURG","RE","NET","PAUSE"],
  horaires: ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"],
  rotation_minutes: 120,
  rotation_warn_minutes: 10,
  pause_after_minutes: 180,
  pause_duration_minutes: 30,
  pause_wave_size: 1,
  sync_blocks_to_system_clock: true,
};

module.exports = async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    const global = await isGlobalAdmin(sb, user.id);
    if (!global) return json(res, 403, { ok: false, error: "Global admin required" });

    const body = await readBody(req);
    const site_code = normalizeSiteCode(body.siteCode || body.site_code);
    const name = String(body.name || "").trim() || null;

    if (!site_code) return json(res, 400, { ok: false, error: "siteCode required" });

    // upsert site
    const r1 = await sb.from("drive_sites").upsert({ site_code, name }, { onConflict: "site_code" }).select("site_code").single();
    if (r1.error) throw r1.error;

    // upsert membership admin
    const r2 = await sb.from("drive_site_members").upsert(
      { site_code, user_id: user.id, role: "admin", member_code: "admin" },
      { onConflict: "site_code,user_id" }
    );
    if (r2.error) throw r2.error;

    // create config if missing
    const r3 = await sb.from("drive_site_config").upsert(
      { site_code, ...DEFAULT, updated_by: user.id },
      { onConflict: "site_code" }
    );
    if (r3.error) throw r3.error;

    return json(res, 200, { ok: true, site_code });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e?.message || String(e) });
  }
};
