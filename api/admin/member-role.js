// api/admin/member-role.js
const { supabaseAdmin, json, requireUser, readBody } = require("./_lib");

function normSite(v) {
  return String(v || "").trim().toLowerCase();
}
function normRole(v) {
  const r = String(v || "").trim().toLowerCase();
  if (r === "member") return "user"; // compat ancien
  return r;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

    const sb = supabaseAdmin();
    const caller = await requireUser(req, sb);
    const body = await readBody(req);

    const site_code = normSite(body.siteCode || body.site_code);
    const user_id = String(body.userId || body.user_id || "").trim();
    const role = normRole(body.role);

    if (!site_code || !user_id || !role) {
      return json(res, 400, { ok: false, error: "siteCode/userId/role required" });
    }

    if (!["admin", "manager", "user"].includes(role)) {
      return json(res, 400, { ok: false, error: "role must be admin|manager|user" });
    }

    // ✅ caller must be admin on this site
    const m = await sb
      .from("drive_site_members")
      .select("role")
      .eq("site_code", site_code)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (m.error) throw m.error;
    if ((m.data?.role || "") !== "admin") return json(res, 403, { ok: false, error: "Not admin" });

    // ✅ target exists + last-admin guard
    const t = await sb
      .from("drive_site_members")
      .select("role")
      .eq("site_code", site_code)
      .eq("user_id", user_id)
      .maybeSingle();

    if (t.error) throw t.error;
    if (!t.data) return json(res, 404, { ok: false, error: "Membre introuvable sur ce site." });

    const targetWasAdmin = t.data.role === "admin";
    const targetWillBeAdmin = role === "admin";

    if (targetWasAdmin && !targetWillBeAdmin) {
      const cnt = await sb
        .from("drive_site_members")
        .select("*", { count: "exact", head: true })
        .eq("site_code", site_code)
        .eq("role", "admin");

      if (cnt.error) throw cnt.error;
      if ((cnt.count || 0) <= 1) {
        return json(res, 400, { ok: false, error: "Impossible : c’est le dernier admin du site." });
      }
    }

    const up = await sb.from("drive_site_members").update({ role }).eq("site_code", site_code).eq("user_id", user_id);
    if (up.error) throw up.error;

    return json(res, 200, { ok: true, role });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
