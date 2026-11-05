// Bo'laklar (tile) bo'yicha yaqin shakllar ro'yxati: shader har pikselda hamma shaklni emas, faqat shu bo'lakka yaqinlarini aylanadi.
// pass = Scene.pack() natijasi (qurilma pikselida). Natija R32F tekstura sifatida yuklanadi (kenglik cap+1, balandlik gw*gh).

/**
 * @param {{count:number, data:Float32Array, merge:number}} pass
 * @param {number} W,H  framebuffer piksel
 * @param {number} dpr
 */
export function buildTiles(pass, W, H, dpr, tile = 32, cap = 64) {
  const gw = Math.ceil(W / tile), gh = Math.ceil(H / tile), width = cap + 1;
  const data = new Float32Array(gw * gh * width);
  const counts = new Int32Array(gw * gh);
  // soya va kaustika masofasi + qo'shilish radiusi: shakldan shuncha uzoqdagi bo'lakka u ta'sir qilishi mumkin
  const margin = 80 * dpr + pass.merge;
  for (let j = 0; j < pass.count; j++) {
    const o = j * 16, cx = pass.data[o], cy = pass.data[o + 1], hw = pass.data[o + 2], hh = pass.data[o + 3];
    const reach = pass.data[o + 9], stretch = pass.data[o + 11];
    const ext = margin + (stretch > 0.5 ? reach * 1.3 + 0.5 * Math.max(hw, hh) : 0);
    const x0 = Math.max(0, Math.floor((cx - hw - ext) / tile)), x1 = Math.min(gw - 1, Math.floor((cx + hw + ext) / tile));
    const y0 = Math.max(0, Math.floor((cy - hh - ext) / tile)), y1 = Math.min(gh - 1, Math.floor((cy + hh + ext) / tile));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = ty * gw + tx, n = counts[id];
        if (n < 0) continue;
        if (n >= cap) { counts[id] = -1; continue; }   // to'lib ketdi: shader bu bo'lakda hamma shaklni aylanadi
        data[id * width + 1 + n] = j;
        counts[id] = n + 1;
      }
    }
  }
  for (let id = 0; id < gw * gh; id++) data[id * width] = counts[id];
  return { data, gw, gh, cap, tile };
}
