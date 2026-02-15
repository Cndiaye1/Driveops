// api/admin/reset-pin.js
const {
  json,
  handleCors,
  readBody,
  getSiteCode,
  supabaseAdmin,
  requireUser,
  ensureAdminOrBootstrap,
} = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const caller = await requireUser(req, sb);
    const body = await readBody(req);

    const site_code = getSiteCode(req, body);
    let user_id = String(body.userId || body.user_id || "").trim();
    const pin = String(body.pin || "").trim();
    const member_code = String(body.code || body.member_code || "").trim().toLowerCase();

    if (!site_code || !pin || (!user_id && !member_code)) {
      return json(res, 400, { ok: false, error: "siteCode, pin and (userId OR code) required" });
    }

    await ensureAdminOrBootstrap(sb, site_code, caller.id);

    // option: reset by member_code
    if (!user_id && member_code) {
      const { data, error } = await sb
        .from("drive_site_members")
        .select("user_id")
        .eq("site_code", site_code)
        .eq("member_code", member_code)
        .maybeSingle();
      if (error) return json(res, 500, { ok: false, error: error.message });
      user_id = data?.user_id || "";
      if (!user_id) return json(res, 404, { ok: false, error: "Member not found" });
    }

    const { error: upErr } = await sb.auth.admin.updateUserById(user_id, { password: pin });
    if (upErr) return json(res, 500, { ok: false, error: upErr.message });

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e?.message || String(e) });
  }
};
