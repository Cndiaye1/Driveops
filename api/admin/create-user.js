// api/admin/create-user.js
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
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json(res, 500, { error: "Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Auth requester (Bearer)
    const token = getBearer(req);
    if (!token) return json(res, 401, { error: "Missing token" });

    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user?.id) return json(res, 401, { error: "Invalid token" });
    const requesterId = u.user.id;

    // Body (vercel parse généralement req.body, mais on sécurise)
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { siteCode, code, pin, role, fullName } = body;

    const site_code = String(siteCode || "").trim().toLowerCase();
    const member_code = String(code || "").trim().toLowerCase();
    const password = String(pin || "").trim();
    const member_role = String(role || "user").trim().toLowerCase();
    const full_name = String(fullName || "").trim();

    if (!site_code || !member_code || !password) {
      return json(res, 400, { error: "Missing required fields: siteCode, code, pin" });
    }
    if (!["admin", "manager", "user"].includes(member_role)) {
      return json(res, 400, { error: "Invalid role (admin|manager|user)" });
    }
    if (password.length < 4) {
      return json(res, 400, { error: "PIN too short (min 4)" });
    }

    // ✅ IMPORTANT : si Supabase Auth impose min password=6 (par défaut)
    // alors mets PIN >= 6 ou change le setting côté Supabase.
    // (On ne bloque pas ici, mais tu verras l’erreur côté createUser/updateUser.)

    // Authorization: requester must be admin for site
    const { data: requesterMembership, error: mErr } = await admin
      .from("drive_site_members")
      .select("role")
      .eq("site_code", site_code)
      .eq("user_id", requesterId)
      .maybeSingle();

    if (mErr) return json(res, 500, { error: mErr.message });
    if ((requesterMembership?.role || "") !== "admin") {
      return json(res, 403, { error: "Forbidden: not a site admin" });
    }

    const email = `${site_code}__${member_code}@driveops.local`;

    // Find existing user (simple, ok pour petite base)
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

    // Profile upsert (on aligne role ici aussi, optionnel)
    const { error: pErr } = await admin.from("profiles").upsert(
      { id: userId, full_name: full_name || null, role: member_role },
      { onConflict: "id" }
    );
    if (pErr) return json(res, 500, { error: pErr.message });

    // Membership upsert
    const { error: msErr } = await admin.from("drive_site_members").upsert(
      { site_code, user_id: userId, role: member_role, member_code },
      { onConflict: "site_code,user_id" }
    );
    if (msErr) return json(res, 500, { error: msErr.message });

    return json(res, 200, {
      ok: true,
      email,
      userId,
      site_code,
      member_code,
      role: member_role,
      created: !existingUser,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};
