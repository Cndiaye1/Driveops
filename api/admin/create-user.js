const { createClient } = require("@supabase/supabase-js");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function handleCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Site-Code");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function getBearer(req) {
  const h = req.headers?.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function readBody(req) {
  if (!req.body) return {};
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString("utf8")); } catch { return {}; }
  }
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { error: "Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" };
  }
  if (String(serviceKey).startsWith("sb_publishable")) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY invalide : tu as mis une clé publishable. Mets la clé service_role (sb_secret_...)." };
  }
  return { supabaseUrl, serviceKey };
}

async function ensureAdminOrBootstrap({ admin, siteCode, requesterId }) {
  const { data: m, error: mErr } = await admin
    .from("drive_site_members")
    .select("role")
    .eq("site_code", siteCode)
    .eq("user_id", requesterId)
    .maybeSingle();

  if (mErr) throw Object.assign(new Error(mErr.message), { status: 500 });

  const role = String(m?.role || "").trim().toLowerCase();
  if (role === "admin") return;

  const { data: anyAdmin, error: aErr } = await admin
    .from("drive_site_members")
    .select("user_id")
    .eq("site_code", siteCode)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (aErr) throw Object.assign(new Error(aErr.message), { status: 500 });

  if (!anyAdmin?.user_id) {
    const { error: upErr } = await admin.from("drive_site_members").upsert(
      { site_code: siteCode, user_id: requesterId, role: "admin", member_code: "admin" },
      { onConflict: "site_code,user_id" }
    );
    if (upErr) throw Object.assign(new Error(upErr.message), { status: 500 });
    return;
  }

  throw Object.assign(new Error("Not admin"), { status: 403 });
}

module.exports = async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const env = getEnv();
    if (env.error) return json(res, 500, { error: env.error });

    const admin = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = getBearer(req);
    if (!token) return json(res, 401, { error: "Missing token" });

    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user?.id) return json(res, 401, { error: "Invalid token" });
    const requesterId = u.user.id;

    const body = readBody(req);

    const site_code = String(body.siteCode || req.headers["x-site-code"] || "").trim().toLowerCase();
    const member_code = String(body.code || "").trim().toLowerCase();
    const password = String(body.pin || "").trim();
    const member_role = String(body.role || "user").trim().toLowerCase();
    const full_name = String(body.fullName || "").trim();

    if (!site_code || !member_code || !password) {
      return json(res, 400, { error: "Missing required fields: siteCode, code, pin" });
    }
    if (!["admin", "manager", "user"].includes(member_role)) {
      return json(res, 400, { error: "Invalid role (admin|manager|user)" });
    }
    if (password.length < 4) {
      return json(res, 400, { error: "PIN too short (min 4)" });
    }

    await ensureAdminOrBootstrap({ admin, siteCode: site_code, requesterId });

    const email = `${site_code}__${member_code}@driveops.local`;

    let existingUser = null;
    {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json(res, 500, { error: error.message });
      existingUser = (data?.users || []).find((x) => (x.email || "").toLowerCase() === email);
    }

    let userId;
    if (!existingUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { site_code, member_code, full_name },
      });
      if (error) return json(res, 500, { error: error.message });
      userId = data.user.id;
    } else {
      userId = existingUser.id;
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { site_code, member_code, full_name },
      });
      if (error) return json(res, 500, { error: error.message });
    }

    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id: userId, full_name: full_name || null }, { onConflict: "id" });
    if (pErr) return json(res, 500, { error: pErr.message });

    const { error: msErr } = await admin
      .from("drive_site_members")
      .upsert(
        { site_code, user_id: userId, role: member_role, member_code },
        { onConflict: "site_code,user_id" }
      );
    if (msErr) return json(res, 500, { error: msErr.message });

    return json(res, 200, {
      ok: true,
      created: !existingUser,
      site_code,
      member_code,
      role: member_role,
      email,
      userId,
    });
  } catch (e) {
    return json(res, e.status || 500, { error: e?.message || String(e) });
  }
};
