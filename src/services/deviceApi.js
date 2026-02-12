// src/services/deviceApi.js
import { supabase } from "./supabaseClient";
import { getDeviceId } from "./deviceId";

export async function getPairedSiteCode() {
  const device_id = getDeviceId();
  const { data, error } = await supabase
    .from("devices")
    .select("site_code")
    .eq("device_id", device_id)
    .maybeSingle();

  if (error) throw error;
  return data?.site_code ? String(data.site_code).toUpperCase() : null;
}

export async function pairDevice(siteCode, label = "") {
  const device_id = getDeviceId();
  const sc = String(siteCode || "").trim().toUpperCase();
  if (!sc) throw new Error("Site code requis.");

  const { error } = await supabase
    .from("devices")
    .upsert({ device_id, site_code: sc, label }, { onConflict: "device_id" });

  if (error) throw error;
  return sc;
}
