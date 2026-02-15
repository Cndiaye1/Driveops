const { createClient } = require("@supabase/supabase-js");

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getBearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

async function requireUser(req, sb) {
  const token = getBearer(req);
  if (!token) throw new Error("Missing bearer token");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("Invalid token");
  return data.user;
}

async function getProfileRole(sb, uid) {
  const { data, error } = await sb.from("profiles").select("role, full_name").eq("id", uid).maybeSingle();
  if (error) throw error;
  return { role: data?.role || "user", full_name: data?.full_name || null };
}

async function isGlobalAdmin(sb, uid) {
  const p = await getProfileRole(sb, uid);
  return String(p.role || "").toLowerCase() === "admin";
}

async function isSiteAdmin(sb, uid, site_code) {
  const sc = String(site_code || "").trim().toUpperCase();
  const { data, error } = await sb
    .from("drive_site_members")
    .select("role, member_role")
    .eq("site_code", sc)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  const role = data?.role || data?.member_role || null;
  return String(role || "").toLowerCase() === "admin";
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = {
  supabaseAdmin,
  json,
  requireUser,
  getProfileRole,
  isGlobalAdmin,
  isSiteAdmin,
  readBody,
};
