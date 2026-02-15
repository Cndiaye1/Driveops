const { supabaseAdmin, json, requireUser, isGlobalAdmin, isSiteAdmin } = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method !== "DELETE") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    const url = new URL(req.url, "http://localhost");
    const site_code = String(url.searchParams.get("site_code") || "").trim().toUpperCase();
    const user_id = String(url.searchParams.get("user_id") || "").trim();

    if (!site_code || !user_id) return json(res, 400, { ok: false, error: "site_code & user_id required" });

    const global = await isGlobalAdmin(sb, user.id);
    const siteAdmin = global ? true : await isSiteAdmin(sb, user.id, site_code);
    if (!siteAdmin) return json(res, 403, { ok: false, error: "Not admin for this site" });

    const r = await sb.from("drive_site_members").delete().eq("site_code", site_code).eq("user_id", user_id);
    if (r.error) throw r.error;

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
