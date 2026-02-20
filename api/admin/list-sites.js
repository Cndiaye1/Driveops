// api/admin/list-sites.js
const {
  json, handleCors, supabaseAdmin, requireUser, isGlobalAdmin
} = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    const global = await isGlobalAdmin(sb, user.id);

    if (global) {
      const { data, error } = await sb
        .from("drive_sites")
        .select("site_code,name,created_at")
        .order("site_code", { ascending: true });

      if (error) throw error;
      return json(res, 200, { ok: true, global: true, sites: data || [] });
    }

    // sinon: sites où je suis membre
    const { data, error } = await sb
      .from("drive_site_members")
      .select("site_code,role,created_at")
      .eq("user_id", user.id)
      .order("site_code", { ascending: true });

    if (error) throw error;
    return json(res, 200, { ok: true, global: false, sites: data || [] });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e?.message || String(e) });
  }
};
