const W = 956, H = 718;
const OPT = window.__APP_BLUE;
const DPR = OPT.pr;
const MODE = "new";
const PLANE = false;
const P = await (await fetch("data/blue_params.json")).json();
const T = P.texts[MODE];
for (const w of [400, 500, 600]) {
  await document.fonts.load(`${w} 40px "Inter Tight"`);
  await document.fonts.load(`${w} 12px "Inter"`);
}
const cv = OPT.canvas;
cv.width = Math.round(W * DPR);
cv.height = Math.round(H * DPR);
const ctx = cv.getContext("2d");
const bg = document.createElement("canvas");
bg.width = cv.width;
bg.height = cv.height;
{
  const g = bg.getContext("2d");
  const im = g.createImageData(bg.width, bg.height);
  const d = im.data;
  const V = P.bg;
  const ch = [V.R, V.G, V.B];
  const gl = P.grid;
  const line = (v, ph, sp, sig) => {
    const dd = ((v - ph) % sp + sp * 1.5) % sp - sp / 2;
    return Math.exp(-0.5 * dd * dd / (sig * sig));
  };
  for (let py = 0; py < bg.height; py++) {
    const y = (py + 0.5) / DPR;
    for (let px = 0; px < bg.width; px++) {
      const x = (px + 0.5) / DPR;
      const k = 4 * (py * bg.width + px);
      const Lmaj = line(x, gl.majX[1], gl.majX[0], gl.sig) + line(y, gl.majY[1], gl.majY[0], gl.sig);
      const Lmin = line(x, gl.minX[1], gl.minX[0], gl.sig) + line(y, gl.minY[1], gl.minY[0], gl.sig);
      for (let c = 0; c < 3; c++) {
        const m = ch[c];
        const dx = (x - m.center[0]) / 478, dy = (y - m.center[1]) * m.y_scale / 478;
        const r2 = dx * dx + dy * dy;
        let v = m.c0 + m.c2 * r2 + m.c4 * r2 * r2;
        v += Lmaj * gl.majAmp[c] + Lmin * gl.minAmp[c];
        d[k + c] = v;
      }
      d[k + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
}
const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = rej;
  i.src = src;
});
const BP = P.blueprint;
const bpImg = await loadImg(BP.image);
const tmImg = await loadImg(BP.timemap);
const bw = Math.round((BP.box[2] - BP.box[0]) * DPR), bh = Math.round((BP.box[3] - BP.box[1]) * DPR);
const tmpA = document.createElement("canvas");
tmpA.width = bw;
tmpA.height = bh;
const ga = tmpA.getContext("2d", { willReadFrequently: true });
ga.drawImage(bpImg, 0, 0, bw, bh);
const artData = ga.getImageData(0, 0, bw, bh);
const tmpT = document.createElement("canvas");
tmpT.width = bw;
tmpT.height = bh;
const gt = tmpT.getContext("2d", { willReadFrequently: true });
gt.imageSmoothingEnabled = false;
gt.drawImage(tmImg, 0, 0, bw, bh);
const tmData = gt.getImageData(0, 0, bw, bh);
const tAppear = new Float32Array(bw * bh);
for (let i = 0; i < bw * bh; i++) tAppear[i] = tmData.data[4 * i + 2] > 127 ? tmData.data[4 * i] + tmData.data[4 * i + 1] / 255 : 9999;
const artOut = ga.createImageData(bw, bh);
function drawArt(t) {
  const o = artOut.data, a = artData.data, ramp = BP.ramp;
  for (let i = 0; i < bw * bh; i++) {
    const k = 4 * i;
    const f = Math.min(1, Math.max(0, (t - tAppear[i]) / ramp + 0.5));
    o[k] = a[k];
    o[k + 1] = a[k + 1];
    o[k + 2] = a[k + 2];
    o[k + 3] = a[k + 3] * f;
  }
  ga.putImageData(artOut, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(tmpA, Math.round(BP.box[0] * DPR), Math.round(BP.box[1] * DPR));
  ctx.restore();
}
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u) => ((ax * u + bx) * u + cx) * u, Y = (u) => ((ay * u + by) * u + cy) * u, dX = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - x;
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    u = Math.min(1, Math.max(0, u));
    return Y(u);
  };
}
const A = P.anim;
const tB = bez(...A.title.bezier), pS = bez(...A.para.s_bezier), pA = bez(...A.para.a_bezier);
const bS = bez(...A.button.s_bezier), bA = bez(...A.button.a_bezier), sS = bez(...A.stats.s_bezier), sA = bez(...A.stats.a_bezier);
function font(L) {
  return `${L.weight} ${L.size}px "${L.family || "Inter Tight"}"`;
}
function setText(L) {
  ctx.font = font(L);
  ctx.letterSpacing = (L.ls || 0) + "px";
  ctx.textBaseline = "alphabetic";
  if (PLANE && L.plane) ctx.fillStyle = `rgba(${L.plane[0]},${L.plane[1]},${L.plane[2]},${L.plane[3]})`;
  else ctx.fillStyle = `rgb(${L.color.join(",")})`;
}
function glyphX(L, s) {
  setText(L);
  const xs = [];
  for (let i = 0; i < s.length; i++) xs.push(L.x + ctx.measureText(s.slice(0, i)).width);
  return xs;
}
function drawTitle(t) {
  let gi = 0;
  T.title.forEach((s, li) => {
    const L = P.lines["title" + (li + 1)];
    const xs = glyphX(L, s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, L.baseline - 60, W, A.title.clip[li] - (L.baseline - 60));
    ctx.clip();
    setText(L);
    for (let i = 0; i < s.length; i++) {
      if (s[i] === " ") continue;
      const t0 = A.title.a + A.title.b * gi + (li === 1 ? A.title.line2 : 0);
      gi++;
      const u = (t - t0) / A.title.T;
      const off = t < t0 ? A.title.S0 : A.title.S0 * (1 - tB(u));
      if (off >= A.title.S0 - 0.01) continue;
      ctx.fillText(s[i], xs[i], L.baseline + off);
    }
    ctx.restore();
  });
}
function drawWords(t) {
  let wi = 0;
  T.para.forEach((s, li) => {
    const L = P.lines["para" + (li + 1)];
    setText(L);
    const words = s.split(" ");
    let x = L.x;
    words.forEach((w) => {
      const key = `para${li + 1}_w${String(words.indexOf(w) >= 0 ? wi : wi).padStart(2, "0")}`;
      const t0 = A.para.t0[wi];
      wi++;
      const off = A.para.S0 * (1 - pS((t - t0) / A.para.Ts));
      const al = pA((t - t0 - A.para.a_delay) / A.para.Ta);
      if (al > 1e-3) {
        ctx.globalAlpha = Math.min(1, al);
        ctx.fillText(w, x, L.baseline + off);
        ctx.globalAlpha = 1;
      }
      x += ctx.measureText(w + " ").width;
    });
  });
}
function drawButton(t) {
  const B = P.button;
  const t0 = A.button.t0;
  const off = A.button.S0 * (1 - bS((t - t0) / A.button.Ts));
  const al = Math.min(1, bA((t - t0 - A.button.a_delay) / A.button.Ta));
  if (al <= 1e-3) return;
  ctx.save();
  ctx.globalAlpha = al;
  ctx.translate(0, off);
  ctx.fillStyle = `rgb(${B.fill.join(",")})`;
  ctx.beginPath();
  ctx.roundRect(B.x0, B.y0, B.w, B.h, B.r);
  ctx.fill();
  const L = P.lines.button;
  setText(L);
  ctx.textAlign = "center";
  ctx.fillText(T.button, B.x0 + B.w / 2 + (L.dx || 0), L.baseline);
  ctx.textAlign = "left";
  ctx.restore();
}
function drawStats(t) {
  T.stats.forEach((st, k) => {
    for (const part of ["value", "label"]) {
      const key = `stat${k + 1}_${part}`;
      const L = P.lines[key];
      const t0 = A.stats.t0[key];
      const off = A.stats.S0 * (1 - sS((t - t0) / A.stats.Ts));
      const al = Math.min(1, sA((t - t0 - A.stats.a_delay) / A.stats.Ta));
      if (al <= 1e-3) continue;
      let s = st[part];
      if (k === 0 && part === "value" && A.counter) {
        const u = Math.min(1, Math.max(0, (t - A.counter.n0) / A.counter.len));
        const v = Math.ceil(A.counter.N * (1 - Math.pow(1 - u, 5)));
        s = s.replace(String(A.counter.N), String(v));
      }
      setText(L);
      ctx.globalAlpha = al;
      ctx.fillText(s, L.x, L.baseline + off);
      ctx.globalAlpha = 1;
    }
  });
}
let doneAt = -1;
const T_DONE = 100;
function renderBlue(t) {
  if (t >= T_DONE && doneAt >= T_DONE) return false;
  doneAt = t;
  if (PLANE) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawWords(999);
    drawButton(999);
    drawStats(999);
    return true;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawArt(t);
  if (!OPT.compact) {
    drawTitle(t);
    drawWords(t);
    drawButton(t);
    drawStats(t);
  }
  return true;
}
function invalidate() {
  doneAt = -1;
}
const ready = true;
export {
  invalidate,
  ready,
  renderBlue
};
