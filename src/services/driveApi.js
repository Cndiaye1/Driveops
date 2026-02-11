// src/services/driveApi.js
import { supabase } from "./supabaseClient";

/**
 * Récupère la session du jour pour un site.
 */
export async function getSession(siteCode, dayISO) {
  const { data, error } = await supabase
    .from("drive_sessions")
    .select("id, site_code, day_date, state_json, updated_at")
    .eq("site_code", siteCode)
    .eq("day_date", dayISO)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Crée une session si elle n'existe pas.
 */
export async function upsertSession(siteCode, dayISO, stateJson) {
  // upsert via unique (site_code, day_date)
  const { data, error } = await supabase
    .from("drive_sessions")
    .upsert(
      { site_code: siteCode, day_date: dayISO, state_json: stateJson },
      { onConflict: "site_code,day_date" }
    )
    .select("id, site_code, day_date, state_json, updated_at")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Sauvegarde la session par id.
 */
export async function updateSession(id, stateJson) {
  const { data, error } = await supabase
    .from("drive_sessions")
    .update({ state_json: stateJson })
    .eq("id", id)
    .select("id, site_code, day_date, state_json, updated_at")
    .single();

  if (error) throw error;
  return data;
}
