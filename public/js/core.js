const VERSION = "0.2.0";
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function springStep(x, v, target, wn, zeta, dt) {
  const y0 = x - target;
  if (wn <= 0) return [x + v * dt, v];
  let y, vy;
  if (zeta < 1 - 1e-9) {
    const wd = wn * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * wn * dt);
    const c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    const B = (v + zeta * wn * y0) / wd;
    y = e * (y0 * c + B * s);
    vy = e * (-zeta * wn * (y0 * c + B * s) + (-y0 * wd * s + B * wd * c));
  } else if (zeta > 1 + 1e-9) {
    const r = wn * Math.sqrt(zeta * zeta - 1), r1 = -zeta * wn + r, r2 = -zeta * wn - r;
    const C2 = (v - r1 * y0) / (r2 - r1), C1 = y0 - C2;
    const e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
    y = C1 * e1 + C2 * e2;
    vy = C1 * r1 * e1 + C2 * r2 * e2;
  } else {
    const e = Math.exp(-wn * dt), B = v + wn * y0;
    y = (y0 + B * dt) * e;
    vy = (B - wn * (y0 + B * dt)) * e;
  }
  return [target + y, vy];
}
function lowpassStep(x, target, tau, dt) {
  if (tau <= 0) return target;
  return target + (x - target) * Math.exp(-dt / tau);
}
class Spring1D {
  constructor(x = 0, wn = 20, zeta = 0.7) {
    this.x = x;
    this.v = 0;
    this.target = x;
    this.wn = wn;
    this.zeta = zeta;
  }
  step(dt) {
    [this.x, this.v] = springStep(this.x, this.v, this.target, this.wn, this.zeta, dt);
    return this.x;
  }
  snapshot() {
    return { x: this.x, v: this.v, target: this.target };
  }
}
class FixedStepClock {
  constructor(step = 1 / 240, maxSteps = 48) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
    this.t = 0;
    this.n = 0;
  }
  reset() {
    this.acc = 0;
    this.t = 0;
    this.n = 0;
  }
  advance(dt, stepFn) {
    this.acc += Math.max(0, dt);
    let k = 0;
    while (this.acc >= this.step - 1e-9 && k < this.maxSteps) {
      stepFn(this.step, this.t);
      this.t = ++this.n * this.step;
      this.acc -= this.step;
      k++;
    }
    if (k >= this.maxSteps) this.acc = 0;
    if (this.acc < 0) this.acc = 0;
    return this.acc / this.step;
  }
  
  runTo(T, stepFn) {
    const target = Math.floor(T / this.step + 1e-9);
    while (this.n < target) {
      stepFn(this.step, this.t);
      this.t = ++this.n * this.step;
    }
    return (T - this.t) / this.step;
  }
}
class EventQueue {
  constructor(events = []) {
    this.ev = events.slice().sort((a, b) => a.t - b.t);
    this.i = 0;
  }
  push(e) {
    this.ev.push(e);
  }
  reset() {
    this.i = 0;
  }
  takeUntil(t) {
    const out = [];
    while (this.i < this.ev.length && this.ev[this.i].t <= t + 1e-9) out.push(this.ev[this.i++]);
    return out;
  }
}
class LiveInput extends EventQueue {
  constructor(el, toLogical, clockNow) {
    super([]);
    this.el = el;
    this.toLogical = toLogical;
    this.now = clockNow;
    this.active = null;
    const push = (type, e) => {
      const [x, y] = toLogical(e.clientX, e.clientY);
      this.ev.push({ t: this.now(), type, x, y, buttons: e.buttons, pointerType: e.pointerType });
    };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => {
      if (this.active !== null) return;
      this.active = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {
      }
      push("down", e);
    });
    el.addEventListener("pointermove", (e) => {
      if (this.active !== null && e.pointerId !== this.active) return;
      push("move", e);
    });
    const end = (type) => (e) => {
      if (e.pointerId !== this.active) return;
      this.active = null;
      push(type, e);
    };
    el.addEventListener("pointerup", end("up"));
    el.addEventListener("pointercancel", end("cancel"));
  }
}
export {
  EventQueue,
  FixedStepClock,
  LiveInput,
  Spring1D,
  VERSION,
  lowpassStep,
  mulberry32,
  springStep
};
