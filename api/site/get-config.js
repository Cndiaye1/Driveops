// api/site/get-config.js
const {
  json, handleCors, supabaseAdmin, requireUser, getSiteCode, requireSiteMember, isGlobalAdmin
} = require("../admin/_lib");

module.exports = async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    const siteCode = getSiteCode(req, null);
    if (!siteCode) return json(res, 400, { ok: false, error: "siteCode required" });

    const global = await isGlobalAdmin(sb, user.id);
    if (!global) await requireSiteMember(sb, user.id, siteCode);

    const { data, error } = await sb.from("drive_site_config").select("*").eq("site_code", siteCode).maybeSingle();
    if (error) throw error;

    // si pas encore de config => renvoie quand même quelque chose (fallback)
    const cfg = data || null;

    return json(res, 200, {
      ok: true,
      site_code: siteCode,
      config: cfg,
    });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e?.message || String(e) });
  }
};
