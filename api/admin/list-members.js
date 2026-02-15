// api/admin/list-members.js
const { createClient } = require("@supabase/supabase-js");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: "Missing env vars" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const token = getBearer(req);
    if (!token) return json(res, 401, { error: "Missing token" });

    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user?.id) return json(res, 401, { error: "Invalid token" });
    const callerId = u.user.id;

    // ✅ lowercase (aligné DB + store)
    const siteCode = String(req.query.siteCode || "").trim().toLowerCase();
    if (!siteCode) return json(res, 400, { error: "siteCode required" });

    // check caller is admin for this site
    const { data: member, error: mErr } = await admin
      .from("drive_site_members")
      .select("role")
      .eq("site_code", siteCode)
      .eq("user_id", callerId)
      .maybeSingle();

    if (mErr) return json(res, 500, { error: mErr.message });
    if ((member?.role || "") !== "admin") return json(res, 403, { error: "Not admin" });

    const { data: rows, error } = await admin
      .from("drive_site_members")
      .select("site_code,user_id,member_code,role,created_at")
      .eq("site_code", siteCode)
      .order("member_code", { ascending: true, nullsFirst: false });

    if (error) return json(res, 500, { error: error.message });

    // join profiles (optional)
    const ids = (rows || []).map((r) => r.user_id).filter(Boolean);
    let profilesById = {};
    if (ids.length) {
      try {
        const { data: profs } = await admin.from("profiles").select("id,full_name").in("id", ids);
        (profs || []).forEach((p) => (profilesById[p.id] = p.full_name || ""));
      } catch {}
    }

    const members = (rows || []).map((r) => ({
      ...r,
      full_name: profilesById[r.user_id] || "",
      email: `${r.site_code}__${r.member_code || "code"}@driveops.local`,
    }));

    return json(res, 200, { ok: true, members });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};
