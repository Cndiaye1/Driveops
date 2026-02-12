// src/services/deviceApi.js
import { supabase } from "./supabaseClient";
import { getDeviceId } from "./deviceId";

const LS_KEY = "driveops_paired_site";

export function getPairedSiteCodeLocal() {
  const v = localStorage.getItem(LS_KEY);
  return v ? String(v).toUpperCase() : null;
}

export function setPairedSiteCodeLocal(siteCode) {
  const sc = String(siteCode || "").trim().toUpperCase();
  if (!sc) return;
  localStorage.setItem(LS_KEY, sc);
  return sc;
}

export async function getPairedSiteCode() {
  // ✅ 1) Offline-first
  const local = getPairedSiteCodeLocal();
  if (local) return local;

  // ✅ 2) Fallback remote (si possible)
  const device_id = getDeviceId();
  const { data, error } = await supabase
    .from("devices")
    .select("site_code")
    .eq("device_id", device_id)
    .maybeSingle();

  if (error) throw error;

  const sc = data?.site_code ? String(data.site_code).toUpperCase() : null;
  if (sc) setPairedSiteCodeLocal(sc);
  return sc;
}

export async function pairDevice(siteCode, label = "") {
  const device_id = getDeviceId();
  const sc = setPairedSiteCodeLocal(siteCode);
  if (!sc) throw new Error("Site code requis.");

  // ✅ Essaye remote (ne casse pas si RLS/network)
  try {
    const { error } = await supabase
      .from("devices")
      .upsert({ device_id, site_code: sc, label }, { onConflict: "device_id" });
    if (error) throw error;
  } catch {
    // offline / RLS : OK, on garde le local
  }

  return sc;
}
