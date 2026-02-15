const { supabaseAdmin, json, requireUser, isGlobalAdmin, isSiteAdmin, readBody } = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);
    const body = await readBody(req);

    const site_code = String(body.site_code || "").trim().toUpperCase();
    const code = String(body.code || "").trim().toUpperCase();
    const pin = String(body.pin || "").trim();
    const role = String(body.role || "staff").trim().toLowerCase(); // staff|admin

    if (!site_code || !code || !pin) return json(res, 400, { ok: false, error: "site_code / code / pin required" });
    if (!["staff", "admin"].includes(role)) return json(res, 400, { ok: false, error: "role must be staff|admin" });

    const global = await isGlobalAdmin(sb, user.id);
    const siteAdmin = global ? true : await isSiteAdmin(sb, user.id, site_code);
    if (!siteAdmin) return json(res, 403, { ok: false, error: "Not admin for this site" });

    const email = `${site_code}__${code}@driveops.local`;

    const created = await sb.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { site_code, code },
    });

    if (created.error) return json(res, 409, { ok: false, error: created.error.message });

    const newUserId = created.data?.user?.id;

    // profile (optionnel)
    await sb.from("profiles").upsert({ id: newUserId, full_name: code, role: "user" });

    // membership
    const memberRole = role === "admin" ? "admin" : "member";
    const up = await sb
      .from("drive_site_members")
      .upsert({ site_code, user_id: newUserId, role: memberRole }, { onConflict: "site_code,user_id" });

    if (up.error) throw up.error;

    return json(res, 200, { ok: true, user_id: newUserId, email });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
