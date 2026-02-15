const { supabaseAdmin, json, requireUser, isGlobalAdmin, isSiteAdmin } = require("./_lib");

module.exports = async (req, res) => {
  try {
    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    const url = new URL(req.url, "http://localhost");
    const site_code = String(url.searchParams.get("site_code") || "").trim().toUpperCase();
    if (!site_code) return json(res, 400, { ok: false, error: "site_code required" });

    const global = await isGlobalAdmin(sb, user.id);
    const siteAdmin = global ? true : await isSiteAdmin(sb, user.id, site_code);
    if (!siteAdmin) return json(res, 403, { ok: false, error: "Not admin for this site" });

    const m = await sb
      .from("drive_site_members")
      .select("site_code,user_id,role,member_role,created_at")
      .eq("site_code", site_code)
      .order("created_at", { ascending: false });

    if (m.error) throw m.error;

    const userIds = (m.data || []).map((x) => x.user_id);
    let profMap = {};
    if (userIds.length) {
      const p = await sb.from("profiles").select("id,full_name,role").in("id", userIds);
      if (p.error) throw p.error;
      for (const row of p.data || []) profMap[row.id] = row;
    }

    const members = (m.data || []).map((x) => {
      const role = x.role || x.member_role || "member";
      const pr = profMap[x.user_id];
      return {
        site_code: x.site_code,
        user_id: x.user_id,
        role,
        created_at: x.created_at,
        full_name: pr?.full_name || null,
        profile_role: pr?.role || null,
      };
    });

    return json(res, 200, { ok: true, members });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
