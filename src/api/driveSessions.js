import { supabase } from "../lib/supabaseClient";

export async function getOrCreateDriveSession({ siteCode, dayDate }) {
  const { data: existing, error: selErr } = await supabase
    .from("drive_sessions")
    .select("*")
    .eq("site_code", siteCode)
    .eq("day_date", dayDate)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from("drive_sessions")
    .insert({
      site_code: siteCode,
      day_date: dayDate,
      state_json: {},
    })
    .select("*")
    .single();

  if (insErr) throw insErr;
  return created;
}

export async function saveDriveSession({ siteCode, dayDate, stateJson }) {
  const { data, error } = await supabase
    .from("drive_sessions")
    .upsert(
      {
        site_code: siteCode,
        day_date: dayDate,
        state_json: stateJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_code,day_date" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
