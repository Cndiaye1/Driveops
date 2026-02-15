// api/admin/member-role.js
const {
  json,
  handleCors,
  readBody,
  getSiteCode,
  supabaseAdmin,
  requireUser,
  ensureAdminOrBootstrap,
} = require("./_lib");

function normalizeRole(v) {
  return String(v || "").trim().toLowerCase();
}

module.exports = async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const caller = await requireUser(req, sb);
    const body = await readBody(req);

    const site_code = getSiteCode(req, body);
    const user_id = String(body.userId || body.user_id || "").trim();
    const role = normalizeRole(body.role);

    if (!site_code || !user_id || !role) {
      return json(res, 400, { ok: false, error: "siteCode, userId, role required" });
    }
    if (!["admin", "manager", "user"].includes(role)) {
      return json(res, 400, { ok: false, error: "role must be admin|manager|user" });
    }

    await ensureAdminOrBootstrap(sb, site_code, caller.id);

    const { error } = await sb
      .from("drive_site_members")
      .update({ role })
      .eq("site_code", site_code)
      .eq("user_id", user_id);

    if (error) return json(res, 500, { ok: false, error: error.message });

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e?.message || String(e) });
  }
};
