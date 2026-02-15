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
function readBody(req) {
  try {
    if (!req.body) return {};
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

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

    const body = readBody(req);
    const siteCode = String(body.siteCode || "").trim().toUpperCase();
    const userId = String(body.userId || "").trim();
    const pin = String(body.pin || "").trim();

    if (!siteCode || !userId || !pin) return json(res, 400, { error: "siteCode, userId, pin required" });

    const { data: member, error: mErr } = await admin
      .from("drive_site_members")
      .select("role")
      .eq("site_code", siteCode)
      .eq("user_id", callerId)
      .maybeSingle();

    if (mErr) return json(res, 500, { error: mErr.message });
    if ((member?.role || "") !== "admin") return json(res, 403, { error: "Not admin" });

    const { error: upErr } = await admin.auth.admin.updateUserById(userId, { password: pin });
    if (upErr) return json(res, 500, { error: upErr.message });

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};
