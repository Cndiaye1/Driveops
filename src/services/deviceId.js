// src/services/deviceId.js
export function getDeviceId() {
  const k = "driveops_device_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
    localStorage.setItem(k, id);
  }
  return id;
}
