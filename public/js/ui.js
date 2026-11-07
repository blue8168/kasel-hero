const W = 956, H = 718;
const OPT = window.__APP_UI;
const DPR = OPT.pr;
const MODE = "new";
const ONLY = "";
const P = await (await fetch("data/ui_params.json")).json();
const T = P.texts[MODE];
{
  const SC = P.badge.schedule;
  const per = 110.4;
  let [t0, w0] = SC[SC.length - 1];
  for (let j = 1; j < 4e3; j++) SC.push([t0 + per * j, w0 + j]);
}
let DOTS = null;
let CUR = null;
try {
  CUR = await (await fetch("data/cursor_sprite.json")).json();
  CUR.shutter = 0.5;
} catch (e) {
}
for (const w of [400, 500, 600]) {
  await document.fonts.load(`${w} 12px "Inter Tight"`);
  await document.fonts.load(`${w} 12px "Inter"`);
}
const cv = OPT.canvas;
cv.width = Math.round(W * DPR);
cv.height = Math.round(H * DPR);
const ctx = cv.getContext("2d");
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function text(L, s, align = "left") {
  ctx.font = `${L.weight} ${L.size}px "${L.family || "Inter Tight"}"`;
  ctx.letterSpacing = (L.ls || 0) + "px";
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = rgba(L.color, L.alpha ?? 1);
  ctx.fillText(s, L.x, L.baseline);
  ctx.textAlign = "left";
}
function drawNav() {
  const N = P.nav;
  const R = N.logo;
  ctx.strokeStyle = rgba([255, 255, 255], R.alpha);
  ctx.lineWidth = R.lw;
  ctx.beginPath();
  ctx.arc(R.cx, R.cy, R.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(R.cx - R.r, R.cy);
  ctx.lineTo(R.cx + R.r, R.cy);
  ctx.moveTo(R.cx, R.cy - R.r);
  ctx.lineTo(R.cx, R.cy + R.r);
  ctx.stroke();
  ctx.fillStyle = rgba([255, 255, 255], R.alpha);
  ctx.beginPath();
  ctx.arc(R.cx, R.cy, R.dot, 0, Math.PI * 2);
  ctx.fill();
  text(N.brand, T.brand);
  N.links.forEach((L, i) => text(L, T.links[i]));
  const Qp = N.quote;
  ctx.strokeStyle = rgba([255, 255, 255], Qp.lineAlpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(Qp.x0, Qp.y0, Qp.w, Qp.h, Qp.r);
  ctx.stroke();
  text(N.quoteText, T.quote, "center");
}
const FONT57 = P.badge.font57;
function wordBits(word) {
  return word.split("").map((ch) => FONT57[ch] || FONT57[" "]);
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
}
function dotsAt(t) {
  const S = P.badge.schedule;
  let k = 0;
  while (k + 1 < S.length && S[k + 1][0] <= t) k++;
  const [ts, wi] = S[k];
  const cur = wordBits(T.badgeWords[wi % T.badgeWords.length]);
  if (k === 0) return cur;
  const prev = wordBits(T.badgeWords[S[k - 1][1] % T.badgeWords.length]);
  const L = P.badge.transLen;
  const r = rng(1e3 + k * 7919);
  const out = [];
  for (let c = 0; c < 4; c++) {
    const g = [];
    for (let y = 0; y < 7; y++) {
      const row = [];
      for (let x = 0; x < 5; x++) {
        const a = prev[c][y][x], b = cur[c][y][x];
        const tf = ts + r() * L;
        const blink = r() < P.badge.blinkProb ? ts + r() * L : -1;
        let v = t < tf ? a : b;
        if (a === 0 && b === 0 && blink >= 0 && t >= blink && t < blink + 1) v = 1;
        row.push(v);
      }
      g.push(row);
    }
    out.push(g);
  }
  return out;
}
function drawBadge(t) {
  const B = P.badge;
  ctx.fillStyle = rgba(B.fill, 1);
  ctx.beginPath();
  ctx.roundRect(B.x0, B.y0, B.w, B.h, B.r);
  ctx.fill();
  text(B.need, T.need, "right");
  text(B.something, T.something, "right");
  const D = dotsAt(t);
  for (let c = 0; c < 4; c++) for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
    const v = D[c][y][x];
    const cx = B.lat.x0 + c * B.lat.adv + x * B.lat.px, cy = B.lat.y0 + y * B.lat.py;
    const col = B.off.map((o, i) => o + (B.on[i] - o) * v);
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.beginPath();
    ctx.arc(cx + 0.5, cy + 0.5, B.dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawRoundBtn() {
  const R = P.roundBtn;
  ctx.fillStyle = rgba(R.fill, 1);
  ctx.beginPath();
  ctx.arc(R.cx, R.cy, R.r, 0, Math.PI * 2);
  ctx.fill();
  R.rows.forEach((row) => {
    ctx.strokeStyle = rgba([255, 255, 255], R.lineAlpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(R.x0, row.y + 0.5);
    ctx.lineTo(R.x1, row.y + 0.5);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(row.knob + 0.5, row.y + 0.5, R.knobR, 0, Math.PI * 2);
    ctx.fill();
  });
}
let CALL = 1;
function visAt(t) {
  return CALL;
  const V = P.callouts.visibility;
  let a = 0;
  for (const [s, e] of V.shown) if (t >= s && t <= e) a = 1;
  for (const [s, e] of V.fade_in) if (t >= s && t <= e) a = Math.max(a, (t - s) / (e - s));
  for (const [s, e] of V.fade_out) if (t >= s && t <= e) a = Math.max(a, 1 - (t - s) / (e - s));
  return a;
}
function drawCallouts(t) {
  const C = P.callouts;
  const va = visAt(t);
  if (va <= 1e-3) return;
  const D = C.dim;
  ctx.strokeStyle = rgba(D.color, D.alpha * va);
  ctx.lineWidth = 1;
  const dl = Math.min(1, Math.max(0, (t - D.t0) / D.len));
  ctx.beginPath();
  ctx.moveTo(D.top.x0, D.top.y + 0.5);
  ctx.lineTo(D.top.x0 + (D.top.x1 - D.top.x0) * dl, D.top.y + 0.5);
  ctx.moveTo(D.right.x + 0.5, D.right.y0);
  ctx.lineTo(D.right.x + 0.5, D.right.y0 + (D.right.y1 - D.right.y0) * dl);
  ctx.stroke();
  C.labels.forEach((L, i) => {
    if (OPT.compact) return;
    const s = T.callouts[i];
    ctx.font = `${L.weight} ${L.size}px "${L.family || "Inter Tight"}"`;
    ctx.letterSpacing = (L.ls || 0) + "px";
    const wTot = ctx.measureText(s).width;
    const fr = t < L.f0 ? 0 : t >= L.f1 ? 1 : (t - L.f0) / (L.f1 - L.f0);
    if (fr <= 0) return;
    if (t >= L.block[0] - 2 && t <= L.block[1]) {
      ctx.fillStyle = rgba(L.color, 0.35 * va);
      ctx.fillRect(L.x + wTot * fr, L.baseline - L.size * 0.75, Math.min(10, wTot * (1 - fr) + 2), L.size * 0.85);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x - 2, L.baseline - L.size * 1.2, wTot * fr + 2, L.size * 1.6);
    ctx.clip();
    ctx.fillStyle = rgba(L.color, va);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, L.x, L.baseline);
    ctx.restore();
  });
}
const curCv = document.createElement("canvas");
const CS = 4;
let curSpr = null;
if (CUR) {
  const sp = CUR.sprite.params, sh = CUR.sprite.shadow, soft = CUR.sprite.soft_sigma_px || 0.4;
  const pad = 8;
  const w = 16 + 2 * pad, h = 22 + 2 * pad;
  curCv.width = w * CS;
  curCv.height = h * CS;
  const g = curCv.getContext("2d");
  g.scale(CS, CS);
  g.translate(pad, pad);
  const path = () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(sp.rx, sp.ry);
    g.quadraticCurveTo(sp.cx, sp.cy, sp.bx, sp.by);
    g.closePath();
  };
  g.save();
  g.filter = `blur(${sh.sigma * CS}px)`;
  g.translate(sh.dx, sh.dy);
  path();
  g.fillStyle = `rgba(0,0,0,${sh.opacity * 0.5})`;
  g.fill();
  g.restore();
  path();
  g.lineJoin = "round";
  g.lineWidth = sp.sw;
  g.strokeStyle = `rgba(${sp.stroke.map(Math.round).join(",")},${sp.sa})`;
  g.stroke();
  path();
  g.fillStyle = `rgb(${sp.fill.map(Math.round).join(",")})`;
  g.fill();
  curSpr = document.createElement("canvas");
  curSpr.width = curCv.width;
  curSpr.height = curCv.height;
  const g2 = curSpr.getContext("2d");
  g2.filter = `blur(${soft * CS}px)`;
  g2.drawImage(curCv, 0, 0);
  curSpr.pad = pad;
}
function drawCursor(c) {
  if (!CUR || !curSpr || !c || !c.vis || OPT.hideCursor) return;
  const x = c.x, y = c.y, vx = OPT.shutter ? c.vx : 0, vy = OPT.shutter ? c.vy : 0, sc = c.scale;
  const K = Math.max(1, Math.min(12, Math.ceil(Math.hypot(vx, vy) * CUR.shutter / 1.5)));
  ctx.save();
  for (let k = 0; k < K; k++) {
    const f = K === 1 ? 0 : (k / (K - 1) - 1) * CUR.shutter;
    ctx.globalAlpha = 1 / K * (K === 1 ? 1 : 1);
    const px = x + f * vx, py = y + f * vy;
    const s = sc / CS;
    ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (px - curSpr.pad * sc), DPR * (py - curSpr.pad * sc));
    ctx.globalCompositeOperation = "source-over";
    if (K > 1) {
      ctx.globalAlpha = 1 / K;
    }
    ctx.drawImage(curSpr, 0, 0);
  }
  ctx.restore();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
function renderUI(t, st) {
  CALL = st.callAlpha;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawCallouts(t);
  if (!OPT.compact) {
    drawNav();
    drawBadge(t);
    drawRoundBtn();
  }
  drawCursor(st.cursor);
  return true;
}
const ready = true;
export {
  ready,
  renderUI
};
