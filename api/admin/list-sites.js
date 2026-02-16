// api/admin/list-sites.js
const { supabaseAdmin, json, requireUser, isGlobalAdmin } = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    // ✅ seul un admin global peut voir tous les sites
    const okGlobal = await isGlobalAdmin(sb, user.id);
    if (!okGlobal) return json(res, 403, { ok: false, error: "Not global admin" });

    const { data, error } = await sb
      .from("drive_sites")
      .select("site_code,name,created_at")
      .order("site_code", { ascending: true });

    if (error) throw error;

    return json(res, 200, { ok: true, sites: data || [] });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
