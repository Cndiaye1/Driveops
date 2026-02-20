// api/admin/_lib.js
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

function getQuery(req, key) {
  if (req.query && req.query[key] != null) return req.query[key];
  try {
    const u = new URL(req.url, "http://localhost");
    return u.searchParams.get(key);
  } catch {
    return null;
  }
}

function normalizeSiteCode(v) {
  return String(v || "").trim().toLowerCase();
}

async function readBody(req) {
  try {
    if (req.body != null) {
      if (typeof req.body === "string") return JSON.parse(req.body || "{}");
      return req.body;
    }
    // fallback (rare)
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getSiteCode(req, body) {
  const h = req.headers["x-site-code"];
  const q = getQuery(req, "siteCode");
  const b = body?.siteCode || body?.site_code;
  return normalizeSiteCode(h || q || b || "");
}

function getEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { error: "Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" };
  }
  if (String(serviceKey).startsWith("sb_publishable")) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY invalide : tu as mis une clé publishable. Mets la clé service_role (sb_secret_...).",
    };
  }

  return { supabaseUrl, serviceKey };
}

function supabaseAdmin() {
  const env = getEnv();
  if (env.error) throw Object.assign(new Error(env.error), { status: 500 });

  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req, sb) {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error("Missing token"), { status: 401 });

  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user?.id) throw Object.assign(new Error("Invalid token"), { status: 401 });

  return u.user;
}

/**
 * ✅ Vérifie que l'utilisateur est membre du site (sinon 403)
 * Retourne la ligne member (role, member_code, etc.)
 */
async function requireSiteMember(sb, userId, siteCode) {
  const site_code = normalizeSiteCode(siteCode);
  if (!site_code) throw Object.assign(new Error("siteCode required"), { status: 400 });

  const { data, error } = await sb
    .from("drive_site_members")
    .select("site_code,user_id,member_code,role,created_at")
    .eq("site_code", site_code)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  if (!data) throw Object.assign(new Error("Not member for this site"), { status: 403 });

  return data;
}

/**
 * ✅ Global admin (optionnel)
 * - Si la table n'existe pas, on retourne false (pas de crash / pas de 500)
 * Table attendue (si tu veux): public.drive_global_admins(user_id uuid primary key, created_at timestamptz)
 */
async function isGlobalAdmin(sb, userId) {
  try {
    const { data, error } = await sb
      .from("drive_global_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // Si la table n'existe pas, Supabase renvoie une erreur → on considère "false"
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("does not exist")) return false;
      // autre erreur -> on ne casse pas non plus, mais on logiquement refuse "global"
      return false;
    }

    return !!data?.user_id;
  } catch {
    return false;
  }
}

/**
 * ✅ Admin site OU bootstrap :
 * - Si caller est déjà admin => ok
 * - Sinon, si aucun admin n’existe sur ce site => bootstrap caller admin
 * - Sinon => 403
 */
async function ensureAdminOrBootstrap(sb, siteCode, callerId) {
  const site_code = normalizeSiteCode(siteCode);
  if (!site_code) throw Object.assign(new Error("siteCode required"), { status: 400 });

  const { data: member, error: mErr } = await sb
    .from("drive_site_members")
    .select("role")
    .eq("site_code", site_code)
    .eq("user_id", callerId)
    .maybeSingle();

  if (mErr) throw Object.assign(new Error(mErr.message), { status: 500 });

  const role = String(member?.role || "").trim().toLowerCase();
  if (role === "admin") return;

  const { data: anyAdmin, error: aErr } = await sb
    .from("drive_site_members")
    .select("user_id")
    .eq("site_code", site_code)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (aErr) throw Object.assign(new Error(aErr.message), { status: 500 });

  if (!anyAdmin?.user_id) {
    const member_code = `admin_${String(callerId).slice(0, 6)}`;
    const { error: upErr } = await sb.from("drive_site_members").upsert(
      { site_code, user_id: callerId, role: "admin", member_code },
      { onConflict: "site_code,user_id" }
    );
    if (upErr) throw Object.assign(new Error(upErr.message), { status: 500 });
    return;
  }

  throw Object.assign(new Error("Not admin"), { status: 403 });
}

module.exports = {
  json,
  handleCors,
  readBody,
  getSiteCode,
  normalizeSiteCode,
  supabaseAdmin,
  requireUser,
  requireSiteMember,
  isGlobalAdmin,
  ensureAdminOrBootstrap,
};
