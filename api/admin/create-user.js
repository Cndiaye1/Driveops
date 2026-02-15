// api/admin/create-user.js
const {
  json,
  handleCors,
  readBody,
  getSiteCode,
  normalizeSiteCode,
  supabaseAdmin,
  requireUser,
  ensureAdminOrBootstrap,
} = require("./_lib");

function normalizeCode(v) {
  return String(v || "").trim().toLowerCase();
}
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
    const code = normalizeCode(body.code);
    const pin = String(body.pin || "").trim();
    const role = normalizeRole(body.role);
    const fullName = String(body.fullName || body.full_name || "").trim();

    if (!site_code || !code || !pin || !role) {
      return json(res, 400, { ok: false, error: "siteCode, code, pin, role required" });
    }
    if (!["admin", "manager", "user"].includes(role)) {
      return json(res, 400, { ok: false, error: "role must be admin|manager|user" });
    }

    await ensureAdminOrBootstrap(sb, site_code, caller.id);

    // 1) si membre existe déjà via member_code => update
    const { data: existing, error: eErr } = await sb
      .from("drive_site_members")
      .select("user_id")
      .eq("site_code", site_code)
      .eq("member_code", code)
      .maybeSingle();

    if (eErr) return json(res, 500, { ok: false, error: eErr.message });

    let userId = existing?.user_id || null;
    let created = false;

    // email de login “technique”
    const email = `${normalizeSiteCode(site_code)}__${code}@driveops.local`;

    if (!userId) {
      // 2) create auth user
      const { data: createdUser, error: cErr } = await sb.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
      });

      if (cErr) {
        return json(res, 500, {
          ok: false,
          error:
            cErr.message ||
            "Erreur createUser. (Si l’utilisateur existe déjà côté Auth, ré-assigne-le via drive_site_members.)",
        });
      }

      userId = createdUser?.user?.id || null;
      if (!userId) return json(res, 500, { ok: false, error: "Auth user id missing" });
      created = true;

      // insert membership
      const { error: insErr } = await sb.from("drive_site_members").insert({
        site_code,
        user_id: userId,
        member_code: code,
        role,
      });

      if (insErr) return json(res, 500, { ok: false, error: insErr.message });
    } else {
      // 3) update pin + role
      const { error: upAuthErr } = await sb.auth.admin.updateUserById(userId, { password: pin });
      if (upAuthErr) return json(res, 500, { ok: false, error: upAuthErr.message });

      const { error: upRoleErr } = await sb
        .from("drive_site_members")
        .update({ role })
        .eq("site_code", site_code)
        .eq("member_code", code);

      if (upRoleErr) return json(res, 500, { ok: false, error: upRoleErr.message });
    }

    // 4) profile (optionnel)
    if (fullName) {
      await sb.from("profiles").upsert({ id: userId, full_name: fullName }, { onConflict: "id" });
    }

    return json(res, 200, {
      ok: true,
      created,
      user_id: userId,
      member_code: code,
      role,
      email,
    });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, error: e?.message || String(e) });
  }
};
