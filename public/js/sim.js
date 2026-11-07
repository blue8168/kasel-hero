import { springStep, mulberry32 } from "./core.js";
const W = 956, H = 718, FPS = 30;
const D2R = Math.PI / 180;
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qaxis = (ax, ang) => {
  const s = Math.sin(ang / 2), n = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  return [ax[0] / n * s, ax[1] / n * s, ax[2] / n * s, Math.cos(ang / 2)];
};
function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = b.map((v) => -v);
  }
  if (d > 0.9995) {
    const r = a.map((v, i) => v + (bb[i] - v) * t);
    const n = Math.hypot(...r);
    return r.map((v) => v / n);
  }
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = ((ax * u + bx) * u + cx) * u - x, d = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    u = clamp(u, 0, 1);
    return ((ay * u + by) * u + cy) * u;
  };
}
const easeInOutCubic = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
function makeCamera(C) {
  const P = C.hinge_point, A = C.hinge_axis, C0 = C.C0, q0 = qaxis([1, 0, 0], -Math.PI / 2);
  const fpx = H / 2 / Math.tan(C.fov * D2R / 2);
  function pose(thetaDeg) {
    const qa = qaxis(A, thetaDeg * D2R);
    const r = qrot(qa, [C0[0] - P[0], C0[1] - P[1], C0[2] - P[2]]);
    return { pos: [P[0] + r[0], P[1] + r[1], P[2] + r[2]], quat: qmul(qa, q0), fov: C.fov };
  }
  function project(cam, p) {
    const v = qrot(qinv(cam.quat), [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]]);
    return [W / 2 + fpx * v[0] / -v[2], H / 2 - fpx * v[1] / -v[2], -v[2]];
  }
  function ray(cam, sx, sy) {
    return qrot(cam.quat, [(sx - W / 2) / fpx, -(sy - H / 2) / fpx, -1]);
  }
  return { pose, project, ray, fpx, fwd: (cam) => qrot(cam.quat, [0, 0, -1]) };
}
function createSim(PR, data) {
  const cam = makeCamera(PR.camera);
  const rng = mulberry32(PR.seed >>> 0);
  const NX = PR.cells.nx, NY = PR.cells.ny, NC = NX * NY;
  const cellX = new Float32Array(NC), cellY = new Float32Array(NC), offB = new Float32Array(NC), offF = new Float32Array(NC), offR = new Float32Array(NC);
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
    const k = cy * NX + cx;
    cellX[k] = PR.cells.ox + (cx + 0.5) * PR.cells.cell;
    cellY[k] = PR.cells.oy + (cy + 0.5) * PR.cells.cell;
    const o = data.cellOffsets[Math.min(cy, data.cellOffsets.length - 1)][cx];
    offB[k] = o * PR.brush.offK;
    offF[k] = o * PR.flood.offK;
    offR[k] = o * PR.ret.offK;
  }
  const HOME = PR.drone.home;
  const LH = data.letterHome;
  const NL = LH.length;
  const hubs = data.hubs;
  const S = {
    t: 0,
    step: 0,
    ptr: { x: -100, y: -100, in: false, down: false, downT: 0, downX: 0, downY: 0, lastX: 0, lastY: 0, onDrone: false, grab: false, scale: 1, vx: 0, vy: 0, px: -100, py: -100 },
    phase: "blue",
    
    ev: { spread: null, tiltIn: null, fly: null, land: null, tiltOut: null, home: null, ret: null, retReady: null, spinUp: null, spinDown: null, cxs: 0, cys: 0, callOut: null, callIn: null },
    cells: new Float32Array(NC),
    brush: new Float32Array(NC),
    theta: 0,
    drone: { p: HOME.slice(), v: [0, 0, 0], q: HOME.slice(), hold: null, yawBase: 0, yawBaseV: 0, yawUser: 0, yawUserV: 0, yawSpin: 0, bank: [PR.drone.restUp[0], PR.drone.restUp[1]], vlag: [0, 0] },
    props: [0, 1, 2, 3].map((i) => ({ phi: data.propRest[i], streak: 0, gain: 1, dash: [], on: false })),
    letters: LH.map((h) => ({ st: 0, p: [h[0], h[1], h[2]], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0], cool: 0, retq: null })),
    eFrame: -1
  };
  const F = (f) => f / FPS;
  function thetaAt(t) {
    const E = S.ev, Tm = PR.tilt;
    if (E.tiltIn === null) return 0;
    const bin = bezier(...Tm.inBezier);
    let th = Tm.max * bin((t - E.tiltIn) / F(Tm.inFrames));
    if (E.tiltOut !== null && t >= E.tiltOut) th = E.thetaOut0 * (1 - easeInOutCubic((t - E.tiltOut) / F(Tm.outFrames)));
    return th;
  }
  function kAt(tilt) {
    return PR.drone.kFlat + (PR.drone.kTilt - PR.drone.kFlat) * Math.min(1, tilt / PR.tilt.max);
  }
  function followTarget(c, sx, sy) {
    const d = cam.ray(c, sx, sy), f = cam.fwd(c);
    const dd = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    const t = PR.drone.D / dd;
    const p = [c.pos[0] + t * d[0], c.pos[1] + t * d[1], c.pos[2] + t * d[2]];
    const B = PR.drone.box;
    p[0] = clamp(p[0], B[0], B[1]);
    p[2] = clamp(p[2], B[2], B[3]);
    return p;
  }
  function dronePose(c, tilt) {
    const D = S.drone, k = kAt(tilt);
    const p = [c.pos[0] + k * (D.p[0] - c.pos[0]), c.pos[1] + k * (D.p[1] - c.pos[1]), c.pos[2] + k * (D.p[2] - c.pos[2])];
    const yaw = (D.yawBase + D.yawUser) * D2R + PR.drone.restYaw * D2R;
    const ux = D.bank[0], uz = D.bank[1], uy = Math.sqrt(Math.max(0, 1 - ux * ux - uz * uz));
    const ax = [uz, 0, -ux], s = Math.hypot(ux, uz);
    const qb = s > 1e-9 ? qaxis(ax, Math.asin(Math.min(1, s))) : [0, 0, 0, 1];
    void uy;
    const q = qmul(qb, qaxis([0, 1, 0], yaw));
    return { p, q, scale: PR.drone.scale * k, k };
  }
  function droneScreen(c, tilt) {
    const dp = dronePose(c, tilt);
    return cam.project(c, dp.p);
  }
  function onEvent(e) {
    const P = S.ptr;
    if (e.type === "move" || e.type === "down" || e.type === "up") {
      P.x = e.x;
      P.y = e.y;
      if (!P.in) {
        P.in = true;
        P.px = e.x;
        P.py = e.y;
      }
    }
    if (e.type === "leave" || e.type === "cancel") {
      if (P.down) release(e, true);
      P.in = false;
      return;
    }
    if (e.type === "down") {
      P.down = true;
      P.downT = S.t;
      P.downX = e.x;
      P.downY = e.y;
      P.lastX = e.x;
      P.lastY = e.y;
      P.grab = false;
      P.path = 0;
      const c = cam.pose(S.theta);
      const ds = droneScreen(c, S.theta);
      P.onDrone = Math.hypot(e.x - ds[0], e.y - ds[1]) < PR.input.droneHitR;
    } else if (e.type === "move" && P.down) {
      const dx = e.x - P.lastX;
      P.path += Math.hypot(dx, e.y - P.lastY);
      P.lastX = e.x;
      P.lastY = e.y;
      if (!P.grab && P.path > PR.input.clickPath && P.onDrone && S.phase === "red" && S.ev.fly !== null && S.t >= S.ev.fly) {
        P.grab = true;
        S.drone.grabDx = (S.drone.grabDx || 0) + (P.lastX - dx - P.downX);
        S.drone.yawUser += PR.drone.yawPerPx * (P.lastX - dx - P.downX);
      }
      if (P.grab) {
        S.drone.yawUser += PR.drone.yawPerPx * dx;
        S.drone.grabDx = (S.drone.grabDx || 0) + dx;
      }
    } else if (e.type === "up" && P.down) release(e, false);
  }
  function release(e, cancelled) {
    const P = S.ptr;
    P.down = false;
    if (P.grab) {
      P.grab = false;
      S.drone.yawUserV = S.drone.yawVelLP || 0;
      S.drone.hold = null;
      return;
    }
    if (cancelled || P.path > PR.input.clickPath) return;
    if (S.phase === "blue") {
      const co = PR.flood.centerOffset || [0, 0];
      S.pending = { t: S.t + F(PR.input.spreadDelay), kind: "spread", x: P.x + co[0], y: P.y + co[1] };
    } else if (S.phase === "red" && S.ev.fly !== null && S.t >= S.ev.fly) S.pending = { t: S.t + F(PR.input.landDelay), kind: "land" };
  }
  function startSpread(x, y) {
    const E = S.ev;
    S.phase = "spread";
    E.spread = S.t;
    E.cxs = x;
    E.cys = y;
    E.tiltIn = S.t + F(PR.tilt.inDelay);
    E.fly = E.tiltIn + F(PR.drone.dfly);
    E.spinUp = S.t + F(PR.props.upDelay);
    E.land = E.tiltOut = E.home = E.ret = E.retReady = E.spinDown = E.letterRet = null;
    E.callOut = S.t + F(PR.callouts.outDelay);
    E.callIn = null;
    S.drone.hold = null;
    S.drone.lastTgt = null;
    S.drone.ls = null;
  }
  function startLand() {
    const E = S.ev;
    S.phase = "land";
    E.land = S.t;
    const tOut = S.t + F(PR.tilt.outDelay);
    E.thetaOut0 = thetaAt(tOut);
    E.tiltOut = tOut;
    E.home = S.t + F(PR.drone.dland);
    E.spinDown = E.tiltOut + F(PR.tilt.outFrames);
    E.ret = null;
    E.retReady = E.spinDown + F(PR.props.stopFrames) + F(PR.ret.afterRest || 0);
    E.letterRet = S.t + F(PR.letters.retDelay);
    E.callIn = null;
    S.drone.hold = S.drone.p.slice();
    S.drone.v = [0, 0, 0];
    S.drone.ls = null;
  }
  function lagged(lag) {
    const Hh = S.hist, P = S.ptr;
    if (!Hh || !Hh.length) return [P.x, P.y];
    const tq = S.t - lag;
    if (tq <= Hh[0][0]) return [Hh[0][1], Hh[0][2]];
    for (let i = Hh.length - 1; i > 0; i--) {
      const a = Hh[i - 1], b = Hh[i];
      if (a[0] <= tq) {
        const u = b[0] > a[0] ? (tq - a[0]) / (b[0] - a[0]) : 1;
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      }
    }
    return [Hh[Hh.length - 1][1], Hh[Hh.length - 1][2]];
  }
  function stepCells(dt) {
    const P = S.ptr, B = PR.brush, E = S.ev;
    const on = P.in;
    const rise = B.rise * dt, R = B.R;
    const since = E.blueAt == null ? 1e9 : (S.t - E.blueAt) * FPS;
    const dec = (B.decay + (B.decayFast - B.decay) * Math.exp(-since / B.decayRelaxFrames)) * dt;
    if (on) {
      const Hh = S.hist || (S.hist = []);
      Hh.push([S.t, P.x, P.y]);
      if (Hh.length > 120) Hh.shift();
    } else if (S.hist) S.hist.length = 0;
    if (on) {
      if (!S.bc) S.bc = [P.x, P.y];
      const a = 1 - Math.exp(-dt / F(B.tauFrames));
      S.bc[0] += (P.x - S.bc[0]) * a;
      S.bc[1] += (P.y - S.bc[1]) * a;
    } else S.bc = null;
    for (let k = 0; k < NC; k++) {
      const d = on ? Math.hypot(cellX[k] - S.bc[0], cellY[k] - S.bc[1]) + offB[k] : 1e9;
      S.brush[k] = d < R ? Math.min(1, S.brush[k] + rise) : Math.max(0, S.brush[k] - dec);
    }
    if (S.phase === "blue") {
      S.cells.set(S.brush);
      return;
    }
    if (S.phase === "red" || S.phase === "land") S.brush.fill(0);
    if (S.phase === "spread") {
      const Fl = PR.flood, Rr2 = Fl.R0 + Fl.speed * FPS * (S.t - E.spread);
      let full = true;
      if (Fl.clearAfter != null && S.t - E.spread >= F(Fl.clearAfter) - 1e-9) S.brush.fill(0);
      for (let k = 0; k < NC; k++) {
        const d = Math.hypot(cellX[k] - E.cxs, cellY[k] - E.cys) + offF[k];
        const a = clamp(0.5 + (Rr2 - d) / Fl.w, 0, 1);
        if (a < 1) full = false;
        S.cells[k] = Math.max(a, S.brush[k]);
      }
      if (full) S.phase = "red";
      return;
    }
    if (S.phase === "red" || S.phase === "land" && (E.ret === null || S.t < E.ret)) {
      S.cells.fill(1);
      return;
    }
    const Rt = PR.ret, u = (S.t - E.ret) * FPS;
    if (P.in) {
      const q = lagged(F(PR.ret.lagFrames || 0));
      E.retX = q[0];
      E.retY = q[1];
    }
    const cx = E.retX ?? W / 2, cy = E.retY ?? H / 2;
    const Rr = B.R + Rt.A * Math.exp(-u / Rt.tau);
    for (let k = 0; k < NC; k++) {
      const d = Math.hypot(cellX[k] - cx, cellY[k] - cy) + offR[k];
      S.cells[k] = Math.max(clamp(0.5 + (Rr - d) / Rt.w, 0, 1), S.brush[k]);
    }
    if (Rr - B.R < Rt.endPx) {
      S.brush.set(S.cells);
      S.phase = "blue";
      E.blueAt = S.t;
    }
  }
  function stepDrone(dt) {
    const D = S.drone, E = S.ev, P = S.ptr, PD = PR.drone;
    const c = cam.pose(S.theta);
    let tgt = HOME, wn = PD.wn, z = PD.zeta, lp = true;
    if (E.tiltIn !== null && E.land === null && S.t < E.fly) {
      const hs = PD.homeScreen, dd = cam.ray(c, hs[0], hs[1]), f = cam.fwd(c), k = PD.homeDepth / (dd[0] * f[0] + dd[1] * f[1] + dd[2] * f[2]);
      tgt = [c.pos[0] + k * dd[0], c.pos[1] + k * dd[1], c.pos[2] + k * dd[2]];
      D.p = tgt.slice();
      D.q = tgt.slice();
      D.v = [0, 0, 0];
      lp = false;
    } else if (E.fly !== null && S.t >= E.fly && E.land === null) {
      if (P.grab) {
        const c2 = Math.exp(-dt / F(PD.grabCoastFrames));
        for (let k = 0; k < 3; k++) {
          D.p[k] += D.v[k] * dt;
          D.v[k] *= c2;
        }
        D.q = D.p.slice();
        D.lastTgt = D.p.slice();
        stepBank(dt, c);
        return;
      } else if (P.in) tgt = followTarget(c, P.x, P.y);
      else tgt = D.lastTgt || D.p.slice();
      D.lastTgt = tgt;
    } else if (E.land !== null) {
      if (!D.ls) {
        const s0 = cam.project(c, D.p);
        D.ls = { x: s0[0], y: s0[1], z: s0[2], vx: 0, vy: 0, vz: 0 };
      }
      const L = D.ls;
      if (S.t >= E.home) {
        const hs = PD.homeScreen;
        [L.x, L.vx] = springStep(L.x, L.vx, hs[0], PD.wnLand, PD.zetaLand, dt);
        [L.y, L.vy] = springStep(L.y, L.vy, hs[1], PD.wnLand, PD.zetaLand, dt);
        [L.z, L.vz] = springStep(L.z, L.vz, PD.homeDepth, PD.wnLand, PD.zetaLand, dt);
      }
      const dd = cam.ray(c, L.x, L.y), f = cam.fwd(c), kk = L.z / (dd[0] * f[0] + dd[1] * f[1] + dd[2] * f[2]);
      D.p = [c.pos[0] + kk * dd[0], c.pos[1] + kk * dd[1], c.pos[2] + kk * dd[2]];
      D.q = D.p.slice();
      D.v = [0, 0, 0];
      stepBank(dt, c);
      return;
    }
    for (let k = 0; k < 3; k++) {
      D.q[k] = lp ? tgt[k] + (D.q[k] - tgt[k]) * Math.exp(-dt / PD.tau) : tgt[k];
      [D.p[k], D.v[k]] = springStep(D.p[k], D.v[k], D.q[k], wn, z, dt);
    }
    stepBank(dt, c);
  }
  function stepBank(dt, c) {
    const D = S.drone, E = S.ev, P = S.ptr, PD = PR.drone;
    void c;
    const vx = D.v[0] / FPS, vz = D.v[2] / FPS;
    const a = 1 - Math.exp(-dt / F(PD.bankLagFrames));
    D.vlag[0] += (vx - D.vlag[0]) * a;
    D.vlag[1] += (vz - D.vlag[1]) * a;
    const flying = E.fly !== null && S.t >= E.tiltIn;
    const bx = flying || E.land !== null ? PD.bankGain * D.vlag[0] : 0, bz = flying || E.land !== null ? PD.bankGain * D.vlag[1] : 0;
    D.bank = [PD.restUp[0] + bx, PD.restUp[1] + bz];
    const baseT = E.tiltIn !== null && S.t >= E.tiltIn && (E.home === null || S.t < E.home) ? PD.yawFly : 0;
    [D.yawBase, D.yawBaseV] = springStep(D.yawBase, D.yawBaseV, baseT, PD.yawWn, 1, dt);
    if (P.grab) {
      const vy = (D.grabDx || 0) * PD.yawPerPx / dt;
      D.grabDx = 0;
      D.yawVelLP = (D.yawVelLP || 0) + (vy - (D.yawVelLP || 0)) * (1 - Math.exp(-dt / F(2)));
    } else if (E.land !== null && S.t >= E.land + F(PD.yawUserResetDelay)) {
      [D.yawUser, D.yawUserV] = springStep(D.yawUser, D.yawUserV, 0, PD.yawUserWn, 1, dt);
    } else {
      D.yawUser += D.yawUserV * dt;
      D.yawUserV *= Math.exp(-dt / F(PD.yawInertiaFrames));
    }
  }
  function stepProps(dt) {
    const E = S.ev, PP = PR.props;
    for (let i = 0; i < 4; i++) {
      const pr = S.props[i];
      const up = E.spinUp, onT = up === null ? null : up + F(PP.discStart[i]);
      const offT = E.spinDown === null ? null : E.spinDown + F(PP.discEnd[i]);
      const restT = E.spinDown === null ? null : E.spinDown + F(PP.stopFrames);
      pr.on = onT !== null && S.t >= onT && (offT === null || S.t < offT);
      if (up === null || S.t < up || restT !== null && S.t >= restT) {
        pr.phi = data.propRest[i];
        pr.stopFrom = null;
        continue;
      }
      if (offT === null || S.t < offT) {
        pr.phi += PP.omega * clamp((S.t - up) / F(Math.max(1, PP.discStart[i])), 0, 1) * dt * PP.sense[i];
        pr.stopFrom = null;
      } else {
        if (pr.stopFrom === null || pr.stopFrom === void 0) {
          pr.stopFrom = pr.phi;
          const s = PP.sense[i];
          let d = s * (data.propRest[i] - pr.phi) % Math.PI;
          if (d < 0) d += Math.PI;
          const want = PP.omega * (restT - offT) / 3;
          pr.stopTo = pr.phi + s * (d + Math.PI * Math.max(0, Math.round((want - d) / Math.PI)));
        }
        const u = clamp((S.t - offT) / (restT - offT), 0, 1);
        pr.phi = pr.stopFrom + (pr.stopTo - pr.stopFrom) * (1 - Math.pow(1 - u, 3));
      }
    }
  }
  function frameE(fr) {
    const PE = data.propE;
    for (let i = 0; i < 4; i++) {
      const pr = S.props[i];
      if (!pr.on) {
        pr.dash = [];
        continue;
      }
      const pool = PE.pool[i];
      const m = pool[Math.floor(rng() * pool.length) % pool.length];
      pr.streak = pr.streakInit ? pr.streak + m.d : rng() * Math.PI * 2;
      pr.streakInit = true;
      pr.gain = m.g;
      const rot = rng() * Math.PI * 2;
      pr.dash = m.a.map((a) => [a[0], (a[1] + rot) % (2 * Math.PI), (a[2] + rot) % (2 * Math.PI), a[3], a[4], a[5]]);
    }
    void fr;
  }
  function hubWorld(dp, i) {
    const h = hubs[i];
    const r = qrot(dp.q, [h[0] * dp.scale, (h[1] + PR.props.lift) * dp.scale, h[2] * dp.scale]);
    return [dp.p[0] + r[0], dp.p[1] + r[1], dp.p[2] + r[2]];
  }
  function stepLetters(dt) {
    const E = S.ev, PL = PR.letters, c = cam.pose(S.theta), tilt = S.theta;
    const flying = E.fly !== null && S.t >= E.fly && E.land === null;
    let hubG = null, dvel = null;
    if (flying) {
      const dp = dronePose(c, tilt);
      const k = kAt(tilt);
      hubG = [0, 1, 2, 3].map((i) => {
        const hw = hubWorld(dp, i);
        const s = cam.project(c, hw);
        const d = cam.ray(c, s[0], s[1]);
        const t = -c.pos[1] / d[1];
        return [c.pos[0] + t * d[0], c.pos[2] + t * d[2], s[0], s[1]];
      });
      {
        const s = cam.project(c, dp.p);
        const d = cam.ray(c, s[0], s[1]);
        const t = -c.pos[1] / d[1];
        hubG.push([c.pos[0] + t * d[0], c.pos[2] + t * d[2], s[0], s[1]]);
      }
      dvel = [S.drone.v[0] * k, S.drone.v[2] * k];
    }
    const dvelS = 1;
    for (let i = 0; i < NL; i++) {
      const Lt = S.letters[i], h0 = LH[i][1];
      if (Lt.cool > 0) Lt.cool -= dt;
      if (hubG && S.props.some((p) => p.on) && Lt.st !== 3 && Lt.cool <= 0 && Lt.p[1] < h0 + PL.hitMaxH) {
        const ls = cam.project(c, Lt.p);
        for (let j = 0; j < 4; j++) {
          const g = hubG[j];
          const ds = Math.hypot(ls[0] - g[2], ls[1] - g[3]);
          if (ds < PL.hitR * dvelS) {
            const rx = Lt.p[0] - g[0], rz = Lt.p[2] - g[1], rn = Math.hypot(rx, rz) || 1;
            const sgn = PR.props.sense[j];
            const tx = -rz / rn * sgn, tz = rx / rn * sgn;
            const j1 = rng() - 0.5, j2 = rng() - 0.5, j3 = rng();
            const sp = PL.vTan * (1 + PL.vJit * j1), rad = PL.vRad * (1 + PL.vJit * j2);
            const vn = Math.hypot(dvel[0], dvel[1]) || 1, fx = dvel[0] / vn, fz = dvel[1] / vn;
            const bx = Lt.p[0] - hubG[4][0], bz = Lt.p[2] - hubG[4][1];
            const side = Math.sign(bx * -fz + bz * fx) || 1;
            const sv = PL.vSide * (1 + PL.vJit * (rng() - 0.5));
            const bn = Math.hypot(bx, bz) || 1, vb = (PL.vBody || 0) * (1 + PL.vJit * (rng() - 0.5));
            Lt.v = [tx * sp + rx / rn * rad + dvel[0] * PL.vDrone - fz * side * sv + bx / bn * vb, PL.vUp * (0.6 + 0.8 * j3), tz * sp + rz / rn * rad + dvel[1] * PL.vDrone + fx * side * sv + bz / bn * vb];
            const ax = [rng() - 0.5, (rng() - 0.5) * 0.4, rng() - 0.5];
            const an = Math.hypot(...ax) || 1;
            const wmag = PL.spin * (0.5 + rng());
            Lt.w = ax.map((v) => v / an * wmag);
            Lt.st = 1;
            Lt.cool = F(PL.coolFrames);
            break;
          }
        }
      }
      if (Lt.st === 1 || Lt.st === 2) {
        Lt.v[1] -= PL.g * dt;
        for (let k = 0; k < 3; k++) Lt.p[k] += Lt.v[k] * dt;
        const wn = Math.hypot(...Lt.w);
        if (wn > 1e-6) Lt.q = qmul(qaxis(Lt.w, wn * dt), Lt.q);
        if (Lt.p[1] <= h0) {
          Lt.p[1] = h0;
          if (Lt.v[1] < 0) Lt.v[1] = -Lt.v[1] * PL.bounce;
          if (Lt.v[1] < PL.restVel) Lt.v[1] = 0;
          const fr = Math.exp(-dt / F(PL.slideTau));
          Lt.v[0] *= fr;
          Lt.v[2] *= fr;
          Lt.w = Lt.w.map((v) => v * Math.exp(-dt / F(PL.spinTau)));
          const up = qrot(Lt.q, [0, 1, 0]);
          const tgtUp = up[1] >= 0 ? [0, 1, 0] : [0, -1, 0];
          const ax = [up[1] * tgtUp[2] - up[2] * tgtUp[1], up[2] * tgtUp[0] - up[0] * tgtUp[2], up[0] * tgtUp[1] - up[1] * tgtUp[0]];
          const s = Math.hypot(...ax);
          if (s > 1e-6) Lt.q = qmul(qaxis(ax, Math.asin(Math.min(1, s)) * (1 - Math.exp(-dt / F(PL.settleTau)))), Lt.q);
          Lt.st = Math.hypot(Lt.v[0], Lt.v[2]) < PL.restVel && Lt.v[1] === 0 ? 2 : 1;
        }
      }
      if (E.letterRet !== void 0 && E.letterRet !== null && S.t >= E.letterRet && Lt.st !== 0) {
        if (Lt.st !== 3) {
          Lt.st = 3;
          Lt.retFrom = Lt.p.slice();
          Lt.retQ = Lt.q.slice();
          Lt.retT0 = S.t;
          Lt.v = [0, 0, 0];
          Lt.rv = 0;
          Lt.ru = 0;
        }
        [Lt.ru, Lt.rv] = springStep(Lt.ru, Lt.rv, 1, PL.retWn, PL.retZeta, dt);
        const u = clamp(Lt.ru, 0, 1.2), H0 = LH[i];
        for (let k = 0; k < 3; k++) Lt.p[k] = Lt.retFrom[k] + (H0[k] - Lt.retFrom[k]) * u;
        Lt.p[1] += PL.retLift * Math.sin(Math.PI * clamp(u, 0, 1));
        Lt.q = qslerp(Lt.retQ, [0, 0, 0, 1], clamp(u, 0, 1));
        if (Math.abs(1 - Lt.ru) < 1e-3 && Math.abs(Lt.rv) < 1e-3) {
          Lt.st = 0;
          Lt.p = [H0[0], H0[1], H0[2]];
          Lt.q = [0, 0, 0, 1];
          Lt.w = [0, 0, 0];
        }
      }
    }
  }
  function stepCursor(dt) {
    const P = S.ptr, tgt = P.down ? PR.cursor.pressScale : 1;
    P.scale = tgt + (P.scale - tgt) * Math.exp(-dt / F(PR.cursor.scaleTauFrames));
  }
  function step(dt, events) {
    for (const e of events) onEvent(e);
    if (S.pending && S.t >= S.pending.t - 1e-9) {
      const pd = S.pending;
      S.pending = null;
      if (pd.kind === "spread" && S.phase === "blue") startSpread(pd.x, pd.y);
      else if (pd.kind === "land" && S.phase === "red") startLand();
    }
    S.theta = thetaAt(S.t);
    {
      const E2 = S.ev, P2 = S.ptr;
      if (S.phase === "land" && E2.ret === null && E2.retReady != null && S.t >= E2.retReady - 1e-9) {
        let hov = false;
        if (P2.in && PR.ret.hoverR) {
          const c = cam.pose(S.theta);
          const ds = droneScreen(c, S.theta);
          hov = Math.hypot(P2.x - ds[0], P2.y - ds[1]) < PR.ret.hoverR;
        }
        if (!hov) {
          E2.ret = S.t;
          E2.callIn = E2.ret + F(PR.callouts.inDelay);
        }
      }
    }
    stepCells(dt);
    stepDrone(dt);
    stepProps(dt);
    stepLetters(dt);
    stepCursor(dt);
    const E = S.ev;
    if (S.phase === "land" && E.ret !== null && S.t >= E.ret) S.phase = "ret";
    S.t += dt;
    S.step++;
    const fr = Math.floor(S.t * FPS + 1e-6);
    if (fr !== S.eFrame) {
      S.eFrame = fr;
      frameE(fr);
    }
    const P = S.ptr;
    if (S.step % Math.max(1, Math.round(1 / (dt * FPS))) === 0) {
      P.svx = P.x - (P.fx ?? P.x);
      P.svy = P.y - (P.fy ?? P.y);
      P.fx = P.x;
      P.fy = P.y;
    }
  }
  function snapshot() {
    const c = cam.pose(S.theta);
    const dp = dronePose(c, S.theta);
    const E = S.ev, t = S.t;
    const callAlpha = (() => {
      if (E.callOut !== null && t >= E.callOut && (E.callIn === null || t < E.callIn)) return clamp(1 - (t - E.callOut) / F(PR.callouts.outFrames), 0, 1);
      if (E.callIn !== null && t >= E.callIn) return clamp((t - E.callIn) / F(PR.callouts.inFrames), 0, 1);
      if (E.callIn !== null && t < E.callIn) return 0;
      return 1;
    })();
    return {
      t,
      frame: t * FPS,
      phase: S.phase,
      theta: S.theta,
      cam: [...c.pos, ...c.quat, c.fov],
      drone: [...dp.p, ...dp.q],
      droneScale: dp.scale,
      props: S.props.map((p) => ({ phi: p.phi, on: p.on, streak: p.streak, gain: p.gain, dash: p.dash })),
      letters: S.letters.map((l) => [l.p[0], l.p[1], l.p[2], l.q[0], l.q[1], l.q[2], l.q[3], l.st === 0 ? 1 : 0]),
      cells: S.cells,
      cursor: { x: S.ptr.x, y: S.ptr.y, vis: S.ptr.in, scale: S.ptr.scale, vx: S.ptr.svx || 0, vy: S.ptr.svy || 0 },
      callAlpha,
      redVisible: S.phase !== "blue" || S.cells.some((v) => v > 2e-3)
    };
  }
  function numbers() {
    const c = cam.pose(S.theta);
    const ds = droneScreen(c, S.theta);
    const o = { theta: S.theta, dx: ds[0], dy: ds[1], yaw: S.drone.yawBase + S.drone.yawUser };
    let sa = 0;
    for (let k = 0; k < NC; k++) sa += S.cells[k];
    o.cellsum = sa;
    S.letters.forEach((l, i) => {
      const s = cam.project(c, l.p);
      o["lx" + i] = s[0];
      o["ly" + i] = s[1];
    });
    return o;
  }
  return { S, step, snapshot, numbers, cam, thetaAt, droneScreen: () => droneScreen(cam.pose(S.theta), S.theta) };
}
export {
  FPS,
  H,
  W,
  createSim,
  makeCamera
};
