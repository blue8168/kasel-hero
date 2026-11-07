import { FixedStepClock, EventQueue, LiveInput } from "./core.js";
import { createSim, FPS, W, H } from "./sim.js";
const q = new URLSearchParams(location.search);
const MODE = q.get("mode") || "live";
const CAPTURE = MODE === "capture";
const DEBUG = q.get("debug") === "1";
const stage = document.getElementById("stage");
const chrome = document.getElementById("chrome");
const cvBlue = document.getElementById("blue"), cvRed = document.getElementById("red"), cvUI = document.getElementById("ui");
const dpr = window.devicePixelRatio || 1;
const FORCE_COMPACT = CAPTURE && q.get("layout") === "compact";
const COARSE = !CAPTURE && window.matchMedia && matchMedia("(pointer: coarse)").matches;
const HOME_X = 645, HOME_Y = 390;
const LETTERS = [25, 445];
let scale = 1, compact = false, portrait = true;
const win = { x0: 0, y0: 0, tx: 0, ty: 0, visW: W, visH: H, panX: false, panY: false, ox: 0, oy: 0, init: false };
const vp = () => [window.innerWidth, window.innerHeight];
const isCompact = (vw, vh) => FORCE_COMPACT || !CAPTURE && (vw / vh < 1.05 || Math.min(vw, vh) < 560 || COARSE && Math.min(vw / W, vh / H) < 1.34);
const compactScale = (vw, vh) => vw < vh ? Math.min(vw / 480, vh * 0.86 / H) : vh / 620;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function placeStage() {
  const s = scale, l = win.panX ? -win.x0 * s : win.ox, t = win.panY ? -win.y0 * s : win.oy;
  stage.style.left = "0px";
  stage.style.top = "0px";
  stage.style.transform = `translate(${l.toFixed(2)}px,${t.toFixed(2)}px) scale(${s})`;
  win.left = l;
  win.top = t;
}
function layout() {
  const [vw, vh] = vp();
  const was = compact;
  compact = isCompact(vw, vh);
  if (compact !== was) onCompactChange();
  if (!compact) {
    scale = Math.min(vw / W, vh / H);
    if (CAPTURE && Math.abs(scale - 1) < 5e-3) {
      scale = 1;
      stage.style.transform = "none";
      stage.style.left = "0px";
      stage.style.top = "0px";
      return { scale, w: W, h: H };
    }
    stage.style.transform = `scale(${scale})`;
    stage.style.left = Math.round((vw - W * scale) / 2) + "px";
    stage.style.top = Math.round((vh - H * scale) / 2) + "px";
    return { scale, w: Math.round(W * scale), h: Math.round(H * scale) };
  }
  portrait = vw < vh;
  scale = compactScale(vw, vh);
  document.body.classList.toggle("portrait", portrait);
  document.body.classList.toggle("landscape", !portrait);
  win.visW = vw / scale;
  win.visH = vh / scale;
  win.panX = win.visW < W;
  win.panY = win.visH < H;
  win.ox = win.panX ? 0 : portrait ? (vw - W * scale) / 2 : vw - W * scale;
  win.oy = win.panY ? 0 : portrait ? vh - H * scale : (vh - H * scale) / 2;
  const band = portrait ? Math.max(0, win.oy) : Math.max(0, win.ox);
  document.documentElement.style.setProperty("--band-size", band.toFixed(1) + "px");
  document.documentElement.style.setProperty("--world-h", (H * scale).toFixed(1) + "px");
  stage.style.setProperty("--fade", band > 1 ? "40px" : "0px");
  if (!win.init) {
    win.x0 = win.tx = clamp(HOME_X - win.visW / 2, 0, Math.max(0, W - win.visW));
    win.y0 = win.ty = clamp(HOME_Y - win.visH / 2, 0, Math.max(0, H - win.visH));
    win.init = true;
  }
  win.x0 = clamp(win.x0, 0, Math.max(0, W - win.visW));
  win.y0 = clamp(win.y0, 0, Math.max(0, H - win.visH));
  placeStage();
  return { scale, w: Math.round(W * scale), h: Math.round(H * scale) };
}
function onCompactChange() {
  document.body.classList.toggle("compact", compact);
  if (chrome) chrome.hidden = !compact;
  win.init = false;
  if (window.__APP_BLUE) {
    window.__APP_BLUE.compact = compact;
    window.__APP_UI.compact = compact;
    window.__APP_RED.compact = compact;
  }
  if (blueMod) blueMod.invalidate();
}
let blueMod = null;
layout();
function prFor(cap) {
  if (CAPTURE) return dpr;
  const [vw, vh] = vp();
  let s = scale;
  if (COARSE) {
    const r = isCompact(vh, vw) ? compactScale(vh, vw) : Math.min(vh / W, vw / H);
    s = Math.max(s, r);
  }
  return Math.min(cap, dpr * s);
}
const PR = prFor(2), PRr = prFor(2);
const [P, D] = await Promise.all([fetch("data/params.json").then((r) => r.json()), fetch("data/sim_data.json").then((r) => r.json())]);
if (!CAPTURE) await Promise.all([400, 500, 600].map((w) => document.fonts.load(`${w} 40px "Inter Tight"`)));
window.__APP_BLUE = { canvas: cvBlue, pr: PR, compact };
window.__APP_UI = { canvas: cvUI, pr: PR, shutter: CAPTURE, hideCursor: q.get("touch") === "1" || COARSE, compact };
window.__APP_RED = { canvas: cvRed, pr: PRr, capture: CAPTURE, compact };
const [blue, ui, red] = await Promise.all([import("./blue.js"), import("./ui.js"), import("./red.js")]);
blueMod = blue;
let sim = createSim(P, D);
let clock = new FixedStepClock(1 / 240);
let queue = new EventQueue([]);
const stepFn = (dt, t) => sim.step(dt, queue.takeUntil(t));
let redShown = true;
function draw(st) {
  blue.renderBlue(st.frame);
  if (st.redVisible) {
    if (!redShown) {
      cvRed.style.visibility = "visible";
      redShown = true;
    }
    red.renderState(st);
    if (compact) sampleBand();
  } else if (redShown) {
    red.clearRed();
    cvRed.style.visibility = "hidden";
    redShown = false;
  } else if (compact) sampleBand();
  ui.renderUI(st.frame, st);
  if (DEBUG) drawDebug(st);
}
let dbg = null;
function drawDebug(st) {
  if (!dbg) {
    dbg = document.createElement("div");
    dbg.style.cssText = "position:absolute;left:8px;top:48px;font:11px/1.4 monospace;color:#fff;background:rgba(0,0,0,.55);padding:4px 6px;pointer-events:none;z-index:9";
    stage.appendChild(dbg);
  }
  dbg.textContent = `${st.phase} · θ ${st.theta.toFixed(1)}° · f ${st.frame.toFixed(1)} · ptr ${st.cursor.x.toFixed(0)},${st.cursor.y.toFixed(0)}`;
}
const px1 = document.createElement("canvas");
px1.width = px1.height = 1;
const px1c = px1.getContext("2d", { willReadFrequently: true });
let bandN = 0, bandCol = "", redFull = false, simPhase = "blue";
let bandAt = [], bandX = -1e9, bandPhase = "";
function sampleBand() {
  bandN++;
  const ph = redFull ? "r" : "b";
  if (ph !== bandPhase) {
    bandPhase = ph;
    bandAt = [bandN + 3, bandN + 15, bandN + 45];
  }
  const moved = Math.abs(win.x0 - bandX) + Math.abs(win.y0 - (bandAt.y0 ?? win.y0)) > 6 && bandN % 20 === 0;
  const flux = (simPhase === "spread" || simPhase === "ret") && bandN % 8 === 0;
  if (!(bandAt.includes(bandN) || moved || flux || bandN === 1)) return;
  bandX = win.x0;
  bandAt.y0 = win.y0;
  const lx = portrait ? clamp((win.panX ? win.x0 : 0) + Math.min(win.visW, W) / 2, 1, W - 1) : 2;
  const ly = portrait ? 2 : clamp((win.panY ? win.y0 : 0) + Math.min(win.visH, H) / 2, 1, H - 1);
  try {
    px1c.clearRect(0, 0, 1, 1);
    px1c.drawImage(cvBlue, Math.floor(lx * PR), Math.floor(ly * PR), 1, 1, 0, 0, 1, 1);
    const b = px1c.getImageData(0, 0, 1, 1).data;
    let c = [b[0], b[1], b[2]];
    if (redShown && redFull) {
      px1c.clearRect(0, 0, 1, 1);
      px1c.drawImage(cvRed, Math.floor(lx * PRr), Math.floor(ly * PRr), 1, 1, 0, 0, 1, 1);
      const r = px1c.getImageData(0, 0, 1, 1).data;
      const a = r[3] / 255;
      c = c.map((v, i) => Math.round(v * (1 - a) + r[i] * a));
    }
    const col = `rgb(${c.join(",")})`;
    if (col !== bandCol) {
      bandCol = col;
      document.documentElement.style.setProperty("--band", col);
    }
  } catch (e) {
  }
}
function track(cur, p, vis, size) {
  let d = cur;
  if (p < cur + 0.3 * vis) d = p - 0.3 * vis;
  else if (p > cur + 0.7 * vis) d = p - 0.7 * vis;
  return clamp(d, 0, Math.max(0, size - vis));
}
let copyOn = null, hintStage = 0;
function frameUpdate(dt, st) {
  if (!compact) return;
  redFull = st.phase !== "blue";
  simPhase = st.phase;
  if (st.phase === "blue") {
    win.tx = clamp(HOME_X - win.visW / 2, 0, Math.max(0, W - win.visW));
    win.ty = clamp(HOME_Y - win.visH / 2, 0, Math.max(0, H - win.visH));
  } else {
    const p = sim.droneScreen();
    win.tx = track(win.tx, p[0], win.visW, W);
    win.ty = track(win.ty, p[1], win.visH, H);
  }
  const a = 1 - Math.exp(-Math.min(dt, 0.1) / 0.28);
  const nx = win.x0 + (win.tx - win.x0) * a, ny = win.y0 + (win.ty - win.y0) * a;
  if (Math.abs(nx - win.x0) > 0.01 || Math.abs(ny - win.y0) > 0.01) {
    win.x0 = nx;
    win.y0 = ny;
    placeStage();
  }
  const vw = window.innerWidth, l0 = win.left + LETTERS[0] * scale, l1 = win.left + LETTERS[1] * scale;
  const lettersIn = Math.min(l1, vw) - Math.max(l0, 0) > 40;
  const on = st.phase === "blue" || !lettersIn;
  if (on !== copyOn) {
    copyOn = on;
    document.body.classList.toggle("copy-off", !on);
  }
  const hs = st.phase === "blue" ? 1 : st.phase === "red" ? 2 : 0;
  if (hs !== hintStage) {
    hintStage = hs;
    const h = document.getElementById("hint");
    if (h) h.dataset.stage = String(hs);
  }
}
function resetSim(events) {
  sim = createSim(P, D);
  clock = new FixedStepClock(1 / 240);
  queue = new EventQueue(events || []);
}
let curLog = null, capF = 0;
const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const APP = {
  mode: MODE,
  ready: async () => {
    await document.fonts.ready;
    return true;
  },
  loadLog(log) {
    curLog = log;
    resetSim(log.events || log);
  },
  async renderAt(f) {
    const T = f / FPS;
    if (sim.S.t > T + 1e-9) {
      resetSim(curLog ? curLog.events || curLog : []);
      capF = 0;
      win.init = false;
      layout();
    }
    clock.runTo(T, stepFn);
    const st = sim.snapshot();
    if (compact) {
      frameUpdate(Math.max(0, f - capF) / FPS, st);
      capF = f;
    }
    draw(st);
    await raf2();
    return true;
  },
  getState() {
    const s = sim.snapshot();
    return { t: s.t, phase: s.phase, theta: s.theta, drone: s.drone, cursor: s.cursor };
  },
  async renderState(st) {
    const cells = new Float32Array(st.cells);
    draw({ ...st, cells, redVisible: true, frame: st.frame });
    await raf2();
    return true;
  },
  hideUI(on) {
    window.__APP_UI.hideCursor = !!on;
    cvUI.style.visibility = on ? "hidden" : "visible";
  },
  trace({ log, hz, T, sample }) {
    const s0 = createSim(P, D);
    const ck = new FixedStepClock(1 / 240);
    const qq = new EventQueue((log.events || log).filter((e) => e.type !== "gap"));
    const gaps = (log.events || log).filter((e) => e.type === "gap").sort((a, b) => a.t - b.t);
    let gi = 0;
    const fn = (dt, t2) => s0.step(dt, qq.takeUntil(t2));
    const out = [];
    let next = 0;
    const rec = (tt) => {
      const n = s0.numbers();
      out.push({ t: +tt.toFixed(4), ...n });
    };
    if (!hz) {
      while (next <= T + 1e-9) {
        ck.runTo(next, fn);
        rec(next);
        next += sample;
      }
      return out;
    }
    const per = Math.round(sample * hz);
    let i = 0, t = 0;
    rec(0);
    while (t < T - 1e-9) {
      if (gi < gaps.length && t >= gaps[gi].t) {
        ck.advance(gaps[gi].dt, fn);
        gi++;
      }
      ck.advance(1 / hz, fn);
      i++;
      t = i / hz;
      if (i % per === 0) rec(t);
    }
    return out;
  },
  handle() {
    const s = sim.snapshot();
    const p = sim.droneScreen();
    return { x: p[0], y: p[1], phase: s.phase };
  },
  layout() {
    const l = layout();
    return { scale: +l.scale.toFixed(4), w: l.w, h: l.h, compact, portrait, x0: +win.x0.toFixed(2), y0: +win.y0.toFixed(2) };
  }
};
window.APP = APP;
let running = false, last = null, frameTimes = null, workTimes = null, auto = null, rafId = 0, hidden = document.hidden;
function kick() {
  if (!rafId && running && !hidden) rafId = requestAnimationFrame(loop);
}
function loop(ts) {
  rafId = 0;
  if (!running || hidden) return;
  const t = ts / 1e3;
  if (last === null) last = t;
  let dt = t - last;
  last = t;
  const w0 = frameTimes ? performance.now() : 0;
  if (frameTimes) frameTimes.push(dt * 1e3);
  if (auto) auto(sim.S.t + dt);
  clock.advance(dt, stepFn);
  const st = sim.snapshot();
  frameUpdate(dt, st);
  draw(st);
  if (queue.i > 512) {
    queue.ev.splice(0, queue.i);
    queue.i = 0;
  }
  if (frameTimes) workTimes.push(performance.now() - w0);
  kick();
}
document.addEventListener("visibilitychange", () => {
  hidden = document.hidden;
  if (hidden) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  } else {
    last = null;
    kick();
  }
});
function startLive() {
  resetSim([]);
  const toLogical = (cx, cy) => {
    const r = stage.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  const li = new LiveInput(stage, toLogical, () => sim.S.t);
  queue = li;
  stage.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") li.push({ t: sim.S.t, type: "leave", x: 0, y: 0 });
  });
  stage.addEventListener("pointerdown", (e) => {
    window.__APP_UI.hideCursor = e.pointerType !== "mouse";
    document.body.classList.add(sim.S.phase === "red" ? "flown" : "touched");
  });
  stage.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") li.push({ t: sim.S.t, type: "leave", x: 0, y: 0 });
  });
  stage.addEventListener("contextmenu", (e) => {
    if (COARSE) e.preventDefault();
  });
  running = true;
  last = null;
  kick();
}
APP.live = ({ on, auto: a }) => {
  if (!on) {
    running = false;
    return true;
  }
  if (a) {
    resetSim([]);
    let k = 0, lastTap = 0;
    auto = (t) => {
      const x = 478 + 300 * Math.sin(t * 0.9) + 60 * Math.sin(t * 3.1), y = 359 + 200 * Math.sin(t * 1.3 + 1) + 40 * Math.cos(t * 2.3);
      queue.push({ t, type: "move", x, y });
      if (t - lastTap > 4.5) {
        lastTap = t;
        queue.push({ t, type: "down", x, y });
        queue.push({ t: t + 0.08, type: "up", x, y });
        k++;
      }
    };
  }
  if (!running) {
    running = true;
    last = null;
    kick();
  }
  return true;
};
APP.perf = ({ sec }) => new Promise((res) => {
  frameTimes = [];
  workTimes = [];
  setTimeout(() => {
    const a = frameTimes.slice(5).sort((x, y) => x - y), w = workTimes.slice(5).sort((x, y) => x - y);
    frameTimes = null;
    workTimes = null;
    const pct = (v, p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    res({ p95: pct(a, 0.95), p50: pct(a, 0.5), n: a.length, frames: a.length, work_p50: pct(w, 0.5), work_p95: pct(w, 0.95) });
  }, sec * 1e3);
});
function fillChrome() {
  if (!chrome) return;
  Promise.all([fetch("data/blue_params.json").then((r) => r.json()), fetch("data/ui_params.json").then((r) => r.json())]).then(([bp, up]) => {
    const T = bp.texts.new, U = up.texts.new, set = (id, s) => {
      const e = document.getElementById(id);
      if (e) e.textContent = s;
    };
    set("c-brand", U.brand);
    set("c-quote", U.quote);
    set("c-t1", T.title[0]);
    set("c-t2", T.title[1]);
    set("c-para", T.para.join(" "));
    set("c-cta", T.button);
    const st = document.getElementById("c-stats");
    if (st) st.innerHTML = T.stats.map((s) => `<div><b>${s.value}</b><span>${s.label}</span></div>`).join("");
  }).catch(() => {
  });
}
const relayout = () => {
  layout();
  if (compact) {
    bandX = -1e9;
  }
};
if (CAPTURE) {
  cvUI.style.cursor = "none";
  document.body.classList.add("capture");
  if (compact) fillChrome();
  draw(sim.snapshot());
} else {
  document.body.classList.add("live");
  fillChrome();
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", () => setTimeout(relayout, 60));
  if (window.visualViewport) visualViewport.addEventListener("resize", relayout);
  startLive();
}
