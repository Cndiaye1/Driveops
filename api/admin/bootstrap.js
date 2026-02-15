const { supabaseAdmin, json, requireUser, getProfileRole, isGlobalAdmin } = require("./_lib");

module.exports = async (req, res) => {
  try {
    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    const prof = await getProfileRole(sb, user.id);
    const global = await isGlobalAdmin(sb, user.id);

    let sites = [];

    if (global) {
      const s = await sb.from("drive_sites").select("site_code,name").order("site_code");
      if (s.error) throw s.error;
      sites = s.data || [];
    } else {
      const m = await sb
        .from("drive_site_members")
        .select("site_code, role, member_role")
        .eq("user_id", user.id);
      if (m.error) throw m.error;

      const adminSiteCodes = (m.data || [])
        .filter((x) => String(x.role || x.member_role || "").toLowerCase() === "admin")
        .map((x) => x.site_code);

      if (adminSiteCodes.length === 0) sites = [];
      else {
        const s = await sb.from("drive_sites").select("site_code,name").in("site_code", adminSiteCodes).order("site_code");
        if (s.error) throw s.error;
        sites = s.data || [];
      }
    }

    return json(res, 200, {
      ok: true,
      user: { id: user.id, email: user.email },
      profile: prof,
      isGlobalAdmin: global,
      sites,
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
