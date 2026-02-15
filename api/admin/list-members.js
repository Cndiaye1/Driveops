const { createClient } = require("@supabase/supabase-js");

function sendJson(res, status, payload) {
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

function getQuery(req, key) {
  if (req.query && req.query[key] != null) return req.query[key];
  try {
    const u = new URL(req.url, "http://localhost");
    return u.searchParams.get(key);
  } catch {
    return null;
  }
}

function getSiteCode(req) {
  const h = req.headers["x-site-code"];
  const q = getQuery(req, "siteCode");
  return String(h || q || "").trim().toLowerCase();
}

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { error: "Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" };
  }
  // ✅ évite les erreurs silencieuses : tu as mis une publishable au lieu de service role
  if (String(serviceKey).startsWith("sb_publishable")) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY invalide : tu as mis une clé publishable. Mets la clé service_role (sb_secret_...)." };
  }

  return { supabaseUrl, serviceKey };
}

async function ensureAdminOrBootstrap({ admin, siteCode, callerId }) {
  const { data: member, error: mErr } = await admin
    .from("drive_site_members")
    .select("role")
    .eq("site_code", siteCode)
    .eq("user_id", callerId)
    .maybeSingle();

  if (mErr) throw Object.assign(new Error(mErr.message), { status: 500 });

  const role = String(member?.role || "").trim().toLowerCase();
  if (role === "admin") return;

  const { data: anyAdmin, error: aErr } = await admin
    .from("drive_site_members")
    .select("user_id")
    .eq("site_code", siteCode)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (aErr) throw Object.assign(new Error(aErr.message), { status: 500 });

  // ✅ bootstrap: si aucun admin existe encore, le 1er qui arrive devient admin
  if (!anyAdmin?.user_id) {
    const { error: upErr } = await admin.from("drive_site_members").upsert(
      { site_code: siteCode, user_id: callerId, role: "admin", member_code: "admin" },
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
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    const env = getEnv();
    if (env.error) return sendJson(res, 500, { error: env.error });

    const admin = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = getBearer(req);
    if (!token) return sendJson(res, 401, { error: "Missing token" });

    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user?.id) return sendJson(res, 401, { error: "Invalid token" });
    const callerId = u.user.id;

    const siteCode = getSiteCode(req);
    if (!siteCode) return sendJson(res, 400, { error: "siteCode required" });

    await ensureAdminOrBootstrap({ admin, siteCode, callerId });

    const { data: rows, error } = await admin
      .from("drive_site_members")
      .select("site_code,user_id,member_code,role,created_at")
      .eq("site_code", siteCode)
      .order("member_code", { ascending: true, nullsFirst: false });

    if (error) return sendJson(res, 500, { error: error.message });

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
      role: String(r.role || "").trim().toLowerCase(),
      full_name: profilesById[r.user_id] || "",
      email: `${r.site_code}__${r.member_code || "code"}@driveops.local`,
    }));

    return sendJson(res, 200, { ok: true, members });
  } catch (e) {
    return sendJson(res, e.status || 500, { error: e?.message || String(e) });
  }
};
