// src/utils/blocks.js

export const timeToMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return h * 60 + m;
};

export const minutesToTime = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const toH = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":");
  if (h == null) return "";
  return `${h}h${String(m ?? "00").padStart(2, "0")}`;
};

export const formatBlockLabel = (block) => {
  if (!block) return "";
  // accepte {start,end} en "HH:MM"
  if (block.start && block.end) return `${toH(block.start)}–${toH(block.end)}`;
  // accepte {label:"06:00–08:00"}
  if (block.label && typeof block.label === "string") {
    const [a, b] = block.label.split("–");
    if (a && b) return `${toH(a)}–${toH(b)}`;
    return block.label;
  }
  return "";
};

// 🔁 Supporte 2 formats horaires :
// A) [{start:"06:00", end:"08:00"}, ...]
// B) ["06:00","07:00",...,"21:00"]
export const buildBlocks = (horaires, rotationMinutes) => {
  const step = Math.max(1, Math.floor(Number(rotationMinutes) || 0));
  const hs = Array.isArray(horaires) ? horaires : [];
  const blocks = [];

  if (!hs.length || !Number.isFinite(step) || step <= 0) return blocks;

  // -------- Format A: objets {start,end}
  const isObjectFormat =
    typeof hs[0] === "object" && hs[0] && "start" in hs[0] && "end" in hs[0];

  if (isObjectFormat) {
    for (const h of hs) {
      const start = timeToMinutes(h.start);
      const end = timeToMinutes(h.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

      for (let t = start; t < end; t += step) {
        const bStart = t;
        const bEnd = Math.min(t + step, end);
        const id = String(bStart);

        blocks.push({
          id,
          start: minutesToTime(bStart),
          end: minutesToTime(bEnd),
          startMin: bStart,
          endMin: bEnd,
          label: `${minutesToTime(bStart)}–${minutesToTime(bEnd)}`,
        });
      }
    }
    return blocks;
  }

  // -------- Format B: tableau de strings "HH:MM"
  if (typeof hs[0] === "string") {
    if (hs.length < 2) return blocks;

    const startMin = timeToMinutes(hs[0]);
    const endMin = timeToMinutes(hs[hs.length - 1]);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin)
      return blocks;

    for (let t = startMin; t < endMin; t += step) {
      const bStart = t;
      const bEnd = Math.min(t + step, endMin);
      const id = String(bStart);

      blocks.push({
        id,
        start: minutesToTime(bStart),
        end: minutesToTime(bEnd),
        startMin: bStart,
        endMin: bEnd,
        label: `${minutesToTime(bStart)}–${minutesToTime(bEnd)}`,
      });
    }
    return blocks;
  }

  return blocks;
};

// retourne le bloc courant selon "nowMinutes"
export const getBlockForNow = (blocks, nowMinutes) => {
  if (!blocks || !blocks.length) return null;
  const found = blocks.find((b) => nowMinutes >= b.startMin && nowMinutes < b.endMin);
  if (found) return found;
  if (nowMinutes < blocks[0].startMin) return blocks[0];
  return blocks[blocks.length - 1];
};

export const getFirstBlockId = (horaires, rotationMinutes) => {
  const blocks = buildBlocks(horaires, rotationMinutes);
  return blocks[0]?.id ?? "0";
};

// ✅ bloc précédent (id en minutes)
export const getPrevBlockId = (horaires, rotationMinutes, currentBlockId) => {
  const blocks = buildBlocks(horaires, rotationMinutes);
  const curId = String(currentBlockId ?? "");
  const idx = blocks.findIndex((b) => b.id === curId);
  if (idx <= 0) return null;
  return blocks[idx - 1]?.id ?? null;
};
