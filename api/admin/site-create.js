const { supabaseAdmin, json, requireUser, isGlobalAdmin, readBody } = require("./_lib");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const user = await requireUser(req, sb);

    const global = await isGlobalAdmin(sb, user.id);
    if (!global) return json(res, 403, { ok: false, error: "Global admin required" });

    const body = await readBody(req);
    const site_code = String(body.site_code || "").trim().toUpperCase();
    const name = String(body.name || "").trim();

    if (!site_code) return json(res, 400, { ok: false, error: "site_code required" });

    const r = await sb.from("drive_sites").insert({ site_code, name });
    if (r.error) throw r.error;

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
