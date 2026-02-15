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

  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) Auth caller
    const token = getBearer(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user?.id) return json(res, 401, { error: "Invalid token" });
    const callerId = u.user.id;

    // 2) Body
    const body = readBody(req);
    const siteCode = String(body.siteCode || "").trim().toUpperCase();
    const code = String(body.code || "").trim().toUpperCase();
    const pin = String(body.pin || "").trim();
    const fullName = String(body.fullName || "").trim();
    const role = String(body.role || "staff").trim().toLowerCase();

    if (!siteCode) return json(res, 400, { error: "siteCode required" });
    if (!code) return json(res, 400, { error: "code required" });
    if (!pin) return json(res, 400, { error: "pin required" });
    if (!["staff", "admin"].includes(role)) return json(res, 400, { error: "role must be staff|admin" });

    // 3) Check caller is admin for that site
    const { data: member, error: mErr } = await admin
      .from("drive_site_members")
      .select("role")
      .eq("site_code", siteCode)
      .eq("user_id", callerId)
      .maybeSingle();

    if (mErr) return json(res, 500, { error: mErr.message });
    if ((member?.role || "") !== "admin") return json(res, 403, { error: "Not admin for this site" });

    // 4) Create Auth user (email= SITE__CODE@driveops.local, password=PIN)
    const email = `${siteCode}__${code}@driveops.local`;

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { siteCode, code, fullName },
    });

    if (cErr) {
      // ex: "User already registered"
      return json(res, 409, { error: cErr.message, email });
    }

    const userId = created.user.id;

    // 5) Upsert profile (si table profiles existe)
    // ignore errors if table doesn't exist
    try {
      await admin.from("profiles").upsert({
        id: userId,
        full_name: fullName || code,
      });
    } catch {}

    // 6) Upsert membership
    const { error: insErr } = await admin
      .from("drive_site_members")
      .upsert(
        { site_code: siteCode, user_id: userId, role },
        { onConflict: "site_code,user_id" }
      );

    if (insErr) return json(res, 500, { error: insErr.message });

    return json(res, 200, { ok: true, userId, email, siteCode, role });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};
