const { supabaseAdmin, json, requireUser, isGlobalAdmin, isSiteAdmin, readBody } = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);
    const body = await readBody(req);

    const site_code = String(body.site_code || "").trim().toUpperCase();
    const user_id = String(body.user_id || "").trim();
    const role = String(body.role || "").trim().toLowerCase(); // admin|member

    if (!site_code || !user_id || !role) return json(res, 400, { ok: false, error: "site_code/user_id/role required" });
    if (!["admin", "member"].includes(role)) return json(res, 400, { ok: false, error: "role must be admin|member" });

    const global = await isGlobalAdmin(sb, user.id);
    const siteAdmin = global ? true : await isSiteAdmin(sb, user.id, site_code);
    if (!siteAdmin) return json(res, 403, { ok: false, error: "Not admin for this site" });

    const r = await sb.from("drive_site_members").update({ role }).eq("site_code", site_code).eq("user_id", user_id);
    if (r.error) throw r.error;

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
