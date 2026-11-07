import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const W = 956, H = 718;
const OPT = window.__APP_RED;
const RPR = OPT.pr;
const q = new URLSearchParams("text=new");
const P = await (await fetch("data/red_params.json")).json();
const S = await (await fetch("data/red_static.json")).json();
const CP = await (await fetch("data/params.json")).json();
const renderer = new THREE.WebGLRenderer({ canvas: OPT.canvas, antialias: true, preserveDrawingBuffer: OPT.capture, alpha: true, premultipliedAlpha: true });
renderer.setPixelRatio(RPR);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const TONE = { NoToneMapping: THREE.NoToneMapping, LinearToneMapping: THREE.LinearToneMapping, ReinhardToneMapping: THREE.ReinhardToneMapping, ACESFilmicToneMapping: THREE.ACESFilmicToneMapping, AgXToneMapping: THREE.AgXToneMapping, NeutralToneMapping: THREE.NeutralToneMapping };
const SHADOW = { BasicShadowMap: THREE.BasicShadowMap, PCFShadowMap: THREE.PCFShadowMap, VSMShadowMap: THREE.VSMShadowMap };
renderer.toneMapping = TONE[P.toneMapping || "NoToneMapping"];
renderer.toneMappingExposure = P.exposure ?? 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = SHADOW[P.shadowType || "VSMShadowMap"];
const scene = new THREE.Scene();
scene.background = null;
renderer.setClearColor(0, 1);
renderer.autoClear = false;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = P.envIntensity ?? 0.6;
const cam = new THREE.PerspectiveCamera(40, W / H, P.near ?? 20, P.far ?? 6e4);
function sample(arr, t) {
  const n = arr.length;
  const t0 = Math.max(0, Math.min(n - 1, Math.floor(t)));
  const t1 = Math.min(n - 1, t0 + 1);
  const f = Math.max(0, Math.min(1, t - t0));
  const a = arr[t0], b = arr[t1];
  if (!a) return null;
  if (!b || f === 0) return a.slice();
  return a.map((v, i) => v + (b[i] - v) * f);
}
function setPose(o, s, i0) {
  o.position.set(s[i0], s[i0 + 1], s[i0 + 2]);
  const qq = new THREE.Quaternion(s[i0 + 3], s[i0 + 4], s[i0 + 5], s[i0 + 6]);
  qq.normalize();
  o.quaternion.copy(qq);
}
const g = P.ground;
const groundMat = new THREE.ShaderMaterial({
  uniforms: {
    uBase: { value: new THREE.Vector3(...g.base) },
    uPitch: { value: new THREE.Vector2(g.pitch[0], g.pitch[1]) },
    uPhase: { value: new THREE.Vector2(g.phase[0], g.phase[1]) },
    uLineSig: { value: g.lineSigma * RPR },
    uLineAmp: { value: new THREE.Vector3(...g.lineAmp) }
  },
  vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    uniform vec3 uBase; uniform vec2 uPitch; uniform vec2 uPhase; uniform float uLineSig; uniform vec3 uLineAmp; varying vec2 vP;
    float line(float v, float pitch, float ph, float sig){
      float d = mod(v - ph + 0.5*pitch, pitch) - 0.5*pitch;
      float w = max(fwidth(v), 1e-4);
      float ds = d / w;
      return exp(-0.5*ds*ds/(sig*sig));
    }
    void main(){
      vec3 col = uBase / 255.0;
      float l = line(vP.x, uPitch.x, uPhase.x, uLineSig) + line(vP.y, uPitch.y, uPhase.y, uLineSig);
      col += l * uLineAmp / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`
});
groundMat.toneMapped = false;
groundMat.depthWrite = false;
groundMat.depthTest = false;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2e5, 2e5), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.renderOrder = -3;
scene.add(ground);
const shadowMat = new THREE.ShadowMaterial({ color: new THREE.Color(...P.shadow.color.map((v) => v / 255)), opacity: P.shadow.opacity, transparent: true, depthWrite: false, depthTest: false });
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2e5, 2e5), shadowMat);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = 0.05;
shadowPlane.receiveShadow = true;
shadowPlane.renderOrder = -1;
scene.add(shadowPlane);
const sun = new THREE.DirectionalLight(P.light.sunColor ? new THREE.Color(...P.light.sunColor) : 16777215, P.light.sun);
sun.castShadow = true;
sun.shadow.mapSize.set(P.shadow.mapSize, P.shadow.mapSize);
sun.shadow.radius = P.shadow.radius;
sun.shadow.blurSamples = P.shadow.blurSamples ?? 16;
sun.shadow.bias = P.shadow.bias ?? -5e-4;
const sc = sun.shadow.camera;
sc.left = -P.shadow.extent;
sc.right = P.shadow.extent;
sc.top = P.shadow.extent;
sc.bottom = -P.shadow.extent;
sc.near = 1;
sc.far = 12e3;
sc.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);
sc.layers.enableAll();
const hemi = new THREE.HemisphereLight(P.light.skyColor ? new THREE.Color(...P.light.skyColor) : 16777215, new THREE.Color(...P.light.groundColor.map((v) => v / 255)), P.light.hemi);
scene.add(hemi);
sun.layers.enableAll();
hemi.layers.enableAll();
const drone = new THREE.Group();
scene.add(drone);
const body = new THREE.Group();
drone.add(body);
const loader = new GLTFLoader();
const gltf = await loader.loadAsync("assets/drone.glb");
const topTex = await new THREE.TextureLoader().loadAsync(P.drone.topTex || "drone_top.png");
topTex.colorSpace = THREE.SRGBColorSpace;
topTex.flipY = true;
topTex.anisotropy = 8;
const GF = P.drone.geomFlatten;
if (GF) {
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  const k = P.drone.yScale ?? 1, pv = P.drone.yPivot ?? 56, r0 = GF.r0 ?? 28, r1 = GF.r1 ?? 40;
  const ML = P.drone.motorLift ?? 0, MLB = P.drone.motorLiftBand ?? [8, 22], MR = (i) => Array.isArray(P.drone.motorR) ? P.drone.motorR[i] : P.drone.motorR ?? 26.5;
  for (const o of meshes) {
    o.geometry = o.geometry.clone();
    o.geometry.applyMatrix4(o.matrixWorld);
    const pa = o.geometry.attributes.position;
    for (let v = 0; v < pa.count; v++) {
      const x = pa.getX(v), y = pa.getY(v), z = pa.getZ(v);
      let d = 1e9;
      for (const h of S.hubs) d = Math.min(d, Math.hypot(x - h[0], z - h[2]));
      const t = Math.min(1, Math.max(0, (d - r0) / (r1 - r0)));
      const sv = 1 + (k - 1) * t * t * (3 - 2 * t);
      let yy = pv + (y - pv) * sv;
      if (ML) S.hubs.forEach((h, hi) => {
        if (Math.hypot(x - h[0], z - h[2]) < MR(hi) + 3) {
          const t0 = h[1] - MLB[1], t1 = h[1] - MLB[0];
          const u = Math.min(1, Math.max(0, (y - t0) / (t1 - t0)));
          yy += ML * u * u * (3 - 2 * u);
        }
      });
      pa.setY(v, yy);
    }
    pa.needsUpdate = true;
    o.geometry.computeBoundingSphere();
    o.geometry.computeBoundingBox();
    const NS = GF.normalSmooth || 0;
    if (NS && o.geometry.index && o.geometry.attributes.normal) {
      const ix = o.geometry.index.array, na = o.geometry.attributes.normal, n = na.array, cnt = na.count;
      for (let it = 0; it < NS; it++) {
        const acc = new Float32Array(cnt * 3);
        for (let f = 0; f < ix.length; f += 3) {
          const a = ix[f] * 3, b = ix[f + 1] * 3, c = ix[f + 2] * 3;
          for (let q2 = 0; q2 < 3; q2++) {
            const sm = n[a + q2] + n[b + q2] + n[c + q2];
            acc[a + q2] += sm;
            acc[b + q2] += sm;
            acc[c + q2] += sm;
          }
        }
        for (let v = 0; v < cnt; v++) {
          const k2 = v * 3;
          const L2 = Math.hypot(acc[k2], acc[k2 + 1], acc[k2 + 2]) || 1;
          n[k2] = acc[k2] / L2;
          n[k2 + 1] = acc[k2 + 1] / L2;
          n[k2 + 2] = acc[k2 + 2] / L2;
        }
      }
      na.needsUpdate = true;
    }
    o.removeFromParent();
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    gltf.scene.add(o);
  }
}
const HUBV = S.hubs.map((h, i) => new THREE.Vector4(h[0], h[2], h[1] + (GF ? P.drone.motorLift ?? 0 : 0), Array.isArray(P.drone.motorR) ? P.drone.motorR[i] : P.drone.motorR ?? 26.5));
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.castShadow = true;
  o.receiveShadow = P.drone.receiveShadow ?? true;
  const m = o.material;
  m.roughness = P.drone.roughness ?? m.roughness;
  m.metalness = P.drone.metalness ?? m.metalness;
  m.envMapIntensity = P.drone.env ?? 1;
  if (P.drone.noNormalMap !== false) {
    m.normalMap = null;
  }
  if (P.drone.baseColor) {
    m.map = null;
    m.color.setRGB(...P.drone.baseColor);
  }
  m.needsUpdate = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTop = { value: topTex };
    sh.uniforms.uTopMix = { value: P.drone.topMix ?? 1 };
    sh.uniforms.uO = { value: new THREE.Vector2(P.drone.origin[0], P.drone.origin[1]) };
    sh.uniforms.uHubs = { value: HUBV };
    const MB = P.drone.motorBell;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLp; varying vec3 vLn;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLp = position; vLn = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uTop; uniform float uTopMix; uniform vec2 uO; uniform vec4 uHubs[4]; varying vec3 vLp; varying vec3 vLn; float gBell = 0.0;").replace("#include <map_fragment>", `#include <map_fragment>
        vec2 muv = vec2((vLp.x + uO.x - 473.0) / 400.0, 1.0 - (vLp.z + uO.y - 177.0) / 400.0);
        vec4 tp = texture2D(uTop, muv);
        float wt = smoothstep(${(P.drone.topN0 ?? 0.3).toFixed(3)}, ${(P.drone.topN1 ?? 0.7).toFixed(3)}, normalize(vLn).y) * tp.a * uTopMix;
        if (muv.x < 0.0 || muv.x > 1.0 || muv.y < 0.0 || muv.y > 1.0) wt = 0.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, tp.rgb * vec3(${(P.drone.topTint || [1, 1, 1]).map((v) => v.toFixed(3)).join(", ")}), wt);
        ${MB ? `{ float bell = 0.0, ring = 0.0; vec3 nn = normalize(cross(dFdx(vLp), dFdy(vLp)));
          for (int i = 0; i < 4; i++) {
            float d = length(vLp.xz - uHubs[i].xy); float inR = 1.0 - smoothstep(uHubs[i].w - 1.2, uHubs[i].w + 1.2, d);
            float side = ${MB.byRadius ? `smoothstep(uHubs[i].w - ${(MB.band + 1).toFixed(2)}, uHubs[i].w - ${(MB.band - 1).toFixed(2)}, d)` : `1.0 - smoothstep(${MB.sideN0.toFixed(3)}, ${MB.sideN1.toFixed(3)}, abs(nn.y))`};
            float below = 1.0 - smoothstep(uHubs[i].z - ${MB.capH.toFixed(2)} - 1.0, uHubs[i].z - ${MB.capH.toFixed(2)}, vLp.y);
            float armS = smoothstep(${(MB.armCos ?? 0.86).toFixed(3)} - 0.04, ${(MB.armCos ?? 0.86).toFixed(3)} + 0.02, dot(normalize(vLp.xz - uHubs[i].xy), normalize(-uHubs[i].xy)))${MB.armYTop != null ? ` * (1.0 - smoothstep(uHubs[i].z - ${MB.armYTop.toFixed(2)}, uHubs[i].z - ${(MB.armYTop - 4).toFixed(2)}, vLp.y))` : ""};
            bell = max(bell, inR * side * below * (1.0 - armS));
            ring = max(ring, inR * side * (1.0 - smoothstep(${MB.ringY[0].toFixed(2)}, ${MB.ringY[1].toFixed(2)}, vLp.y)));
          }
          gBell = bell * (1.0 - ring);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${MB.dark.toFixed(4)}), gBell);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${MB.ring.toFixed(4)}), ring * bell); }` : ""}`).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
 roughnessFactor = mix(roughnessFactor, ${(MB ? MB.rough : 0.4).toFixed(3)}, gBell);`).replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
 metalnessFactor = mix(metalnessFactor, ${(MB ? MB.metal : 0).toFixed(3)}, gBell);`).replace("#include <aomap_fragment>", `#include <aomap_fragment>
 reflectedLight.directSpecular *= mix(1.0, ${(MB ? MB.spec ?? 0.15 : 1).toFixed(3)}, gBell); reflectedLight.indirectSpecular *= mix(1.0, ${(MB ? MB.envSpec ?? 0.3 : 1).toFixed(3)}, gBell);`);
    window.__topPatched = (window.__topPatched || 0) + 1;
  };
});
if (!GF && P.drone.yScale && P.drone.yScale !== 1) {
  const k = P.drone.yScale, pv = P.drone.yPivot ?? 56;
  gltf.scene.scale.y = k;
  gltf.scene.position.y = pv * (1 - k);
}
gltf.scene.traverse((o) => {
  if (o.isMesh) o.layers.set(1);
});
body.add(gltf.scene);
const propTex = await new THREE.TextureLoader().loadAsync("assets/prop.png");
propTex.colorSpace = THREE.SRGBColorSpace;
propTex.anisotropy = 8;
const discTex = await new THREE.TextureLoader().loadAsync(P.prop.tintTex || "prop_disc.png");
discTex.colorSpace = THREE.SRGBColorSpace;
const dbs = renderer.getDrawingBufferSize(new THREE.Vector2());
const backTex = new THREE.FramebufferTexture(dbs.x, dbs.y);
backTex.minFilter = THREE.LinearFilter;
backTex.magFilter = THREE.LinearFilter;
const FP_N = P.prop.blurSamples ?? 48;
function makeFootprint(Rfp) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tBack: { value: backTex }, uMVP: { value: new THREE.Matrix4() }, uDelta: { value: 0 }, uRout: { value: Rfp }, uOn: { value: 0 } },
    vertexShader: `varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tBack; uniform mat4 uMVP; uniform float uDelta; uniform float uRout; uniform float uOn; varying vec2 vL;
      void main(){
        float r = length(vL); float th = atan(vL.y, vL.x); vec3 acc = vec3(0.0);
        for (int k = 0; k < ${FP_N}; k++) {
          float a = th + uDelta * (float(k) / float(${FP_N - 1}) - 0.5);
          vec4 c = uMVP * vec4(r * cos(a), r * sin(a), 0.0, 1.0);
          acc += texture2D(tBack, c.xy / c.w * 0.5 + 0.5).rgb;
        }
        gl_FragColor = vec4(acc / float(${FP_N}), uOn * smoothstep(uRout, uRout - 2.0, r));
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(Rfp, 160), mat);
  m.rotation.x = -Math.PI / 2;
  m.layers.set(2);
  m.renderOrder = 10;
  return m;
}
function bladeNormalMap(N, tiltDeg, wHalf, twistDeg) {
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N;
    const c = (u - v) / Math.SQRT2, sp = (u + v - 1) / Math.SQRT2;
    const th = THREE.MathUtils.degToRad(tiltDeg) * Math.max(-1, Math.min(1, c / wHalf)) + THREE.MathUtils.degToRad(twistDeg) * sp;
    const nx = Math.sin(th) / Math.SQRT2, ny = -Math.sin(th) / Math.SQRT2, nz = Math.cos(th);
    const k = 4 * (y * N + x);
    d[k] = (nx * 0.5 + 0.5) * 255;
    d[k + 1] = (ny * 0.5 + 0.5) * 255;
    d[k + 2] = (nz * 0.5 + 0.5) * 255;
    d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N);
  t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}
const BM = P.prop.bladeMat;
const bladeNM = BM ? bladeNormalMap(512, BM.tiltDeg, BM.wHalf, BM.twistDeg) : null;
const SENSE = [1, -1, -1, 1];
let V6T = null;
if (P.prop.v6) {
  const ld = async (f) => {
    const t = await new THREE.TextureLoader().loadAsync(f);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const V = P.prop.v6;
  V6T = { base: await ld(V.base), sp: await ld(V.streakP), sm: await ld(V.streakM), bp: await ld(V.bladeP), bm: await ld(V.bladeM) };
}
const props = [];
for (let i = 0; i < 4; i++) {
  const hub = S.hubs[i];
  const hoff = P.prop.hubOff && P.prop.hubOff[i] || [0, 0];
  const grp = new THREE.Group();
  grp.position.set(hub[0] + hoff[0], hub[1] + (P.prop.lift ?? 2), hub[2] + hoff[1]);
  body.add(grp);
  const R = P.prop.radius;
  const blade = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * R * P.prop.texScale, 2 * R * P.prop.texScale),
    new THREE.MeshStandardMaterial({ map: propTex, color: new THREE.Color(...(P.prop.bladeColor || [255, 255, 255]).map((v) => v / 255)), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 })
  );
  blade.rotation.x = -Math.PI / 2;
  blade.castShadow = true;
  if (BM && !V6T) {
    blade.material.normalMap = bladeNM;
    blade.material.roughness = BM.rough;
    blade.material.metalness = BM.metal;
    blade.material.needsUpdate = true;
  }
  if (V6T) blade.material = new THREE.MeshBasicMaterial({ map: SENSE[i] > 0 ? V6T.bp : V6T.bm, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });
  const BT = P.prop.bladeTone;
  if (BT && !V6T) {
    const darkPlus = (BT.darkPlus || [1, 0, 0, 1])[i];
    blade.userData.glint = { value: 0 };
    blade.material.onBeforeCompile = (sh) => {
      sh.uniforms.uGlint = blade.userData.glint;
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uGlint; float gDk = 0.0;").replace("#include <map_fragment>", `#include <map_fragment>
          { float sd_ = (vMapUv.x + vMapUv.y) - 1.0; float dk = ${darkPlus ? "smoothstep(-0.02, 0.02, sd_)" : "smoothstep(0.02, -0.02, sd_)"};
            float ch = clamp(((vMapUv.x - vMapUv.y) / 1.41421) / ${(BT.chordW || 0.05).toFixed(4)} * 0.5 + 0.5, 0.0, 1.0);
            vec3 g_ = mix(vec3(${(BT.greyLo ?? BT.grey).toFixed(4)}), vec3(${(BT.greyHi ?? BT.grey).toFixed(4)}), ch);
            vec3 d_ = mix(vec3(${(BT.darkLo ?? BT.dark).toFixed(4)}), vec3(${(BT.darkHi ?? BT.dark).toFixed(4)}), ch);
            diffuseColor.rgb = mix(g_, d_, dk); gDk = dk; }`).replace("#include <aomap_fragment>", `#include <aomap_fragment>
 reflectedLight.directSpecular *= mix(1.0, ${(BT.darkSpec ?? 1).toFixed(3)}, gDk); reflectedLight.indirectSpecular *= mix(1.0, ${(BT.darkSpec ?? 1).toFixed(3)}, gDk);`).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          { float sd_ = (vMapUv.x + vMapUv.y) - 1.0; float lt = ${darkPlus ? "smoothstep(0.02, -0.02, sd_)" : "smoothstep(-0.02, 0.02, sd_)"};
            float rr = length(vMapUv - 0.5) * 2.0; float g = 0.0;
            ${(BT.glintR || []).map((r) => `g += exp(-0.5 * pow((rr - ${r.toFixed(3)}) / ${(BT.glintW || 8e-3).toFixed(4)}, 2.0));`).join(" ")}
            totalEmissiveRadiance += vec3(uGlint * ${(BT.glintI || 1).toFixed(3)} * g * lt); }`);
    };
  }
  blade.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: propTex, alphaTest: 0.35 });
  const spin = new THREE.Group();
  spin.add(blade);
  grp.add(spin);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(R * P.prop.discScale, 96),
    new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.5;
  spin.add(disc);
  disc.layers.set(2);
  disc.renderOrder = 11;
  const fp = makeFootprint(P.prop.blurRadius ?? 106);
  fp.position.y = 0.3;
  grp.add(fp);
  const rings = [];
  for (const rr of P.prop.rings) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(rr[0] - rr[1] / 2, rr[0] + rr[1] / 2, 160),
      new THREE.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: rr[2], depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.6;
    ring.layers.set(2);
    ring.renderOrder = 12;
    grp.add(ring);
    rings.push(ring);
  }
  let v6 = null;
  if (V6T) {
    const V = P.prop.v6, Rd = V.discR ?? 110;
    const mk = (tex, ro) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(Rd, 128), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.layers.set(2);
      m.renderOrder = ro;
      return m;
    };
    const base = mk(V6T.base, 11);
    base.position.y = 0.5;
    grp.add(base);
    const hold = new THREE.Group();
    hold.position.y = 0.55;
    grp.add(hold);
    const streak = mk(SENSE[i] > 0 ? V6T.sp : V6T.sm, 12);
    hold.add(streak);
    const NA = V.dashMax ?? 24;
    const dmat = new THREE.ShaderMaterial({
      uniforms: {
        uA: { value: Array.from({ length: NA }, () => new THREE.Vector4()) },
        uB: { value: Array.from({ length: NA }, () => new THREE.Vector2()) },
        uN: { value: 0 },
        uSig: { value: V.dashSigma ?? 1.3 },
        uExt: { value: THREE.MathUtils.degToRad(V.dashExtDeg ?? 4) },
        uGain: { value: V.dashGain ?? 1 }
      },
      vertexShader: `varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec4 uA[${NA}]; uniform vec2 uB[${NA}]; uniform int uN; uniform float uSig; uniform float uExt; uniform float uGain; varying vec2 vL;
        void main(){ float r = length(vL); float th = atan(-vL.y, vL.x); float I = 0.0;
          for (int k = 0; k < ${NA}; k++) { if (k >= uN) break; vec4 a = uA[k];
            float d = mod(th - a.y + 12.5663706, 6.2831853); float env;
            if (d <= a.z) env = 0.62 + 0.38 * sin(3.14159265 * d / max(a.z, 1e-3));
            else env = 0.62 * max(0.0, 1.0 - min(d - a.z, 6.2831853 - d) / uExt);
            float rk = a.x + uB[k].x * cos(th) + uB[k].y * sin(th);
            I += a.w * env * exp(-0.5 * pow((r - rk) / uSig, 2.0)); }
          gl_FragColor = vec4(vec3(I * uGain / 255.0), 1.0); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const dash = new THREE.Mesh(new THREE.CircleGeometry(Rd, 160), dmat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.y = 0.6;
    dash.layers.set(2);
    dash.renderOrder = 13;
    grp.add(dash);
    v6 = { base, hold, streak, dash };
    disc.visible = false;
  }
  props.push({ grp, spin, blade, disc, rings, fp, v6 });
}
const planeTex = await new THREE.TextureLoader().loadAsync(P.planeText.images[q.get("text")]);
planeTex.colorSpace = THREE.SRGBColorSpace;
planeTex.anisotropy = 16;
const ptW = P.planeText.w, ptH = P.planeText.h;
const planeText = new THREE.Mesh(new THREE.PlaneGeometry(ptW, ptH), new THREE.MeshBasicMaterial({ map: planeTex, transparent: true, depthWrite: false, toneMapped: false }));
planeText.rotation.x = -Math.PI / 2;
planeText.position.set(P.planeText.x + ptW / 2, 0.1, P.planeText.y + ptH / 2);
planeText.renderOrder = -2;
planeText.material.depthTest = false;
scene.add(planeText);
const letters = [];
const letterRest = [];
{
  const LT = P.letters;
  const TXT = LT.texts[q.get("text")];
  const ot = await import("../vendor/opentype.js");
  const font = ot.parse(await (await fetch(LT.ttf)).arrayBuffer());
  const ff = new FontFace("Inter Tight", `url(${LT.woff2})`, { weight: String(LT.weight) });
  await ff.load();
  document.fonts.add(ff);
  const mc = document.createElement("canvas").getContext("2d");
  const capMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...LT.color.map((v) => v / 255)), toneMapped: false });
  const sideMat = LT.sideUnlit ? new THREE.MeshBasicMaterial({ color: new THREE.Color(...LT.side.map((v) => v / 255)), toneMapped: false }) : new THREE.MeshStandardMaterial({ color: new THREE.Color(...(LT.side || [200, 205, 225]).map((v) => v / 255)), roughness: LT.roughness ?? 0.5, metalness: 0, envMapIntensity: LT.env ?? 1 });
  const mat = [capMat, sideMat];
  TXT.forEach((line, li) => {
    const L2 = LT.lines[li];
    mc.font = `${LT.weight} ${L2.size}px "Inter Tight"`;
    mc.letterSpacing = (L2.ls || 0) + "px";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === " ") continue;
      const x = L2.x + mc.measureText(line.slice(0, i)).width;
      const path = font.getPath(ch, 0, 0, L2.size);
      const sp = new THREE.ShapePath();
      for (const c2 of path.commands) {
        if (c2.type === "M") sp.moveTo(c2.x, -c2.y);
        else if (c2.type === "L") sp.lineTo(c2.x, -c2.y);
        else if (c2.type === "Q") sp.quadraticCurveTo(c2.x1, -c2.y1, c2.x, -c2.y);
        else if (c2.type === "C") sp.bezierCurveTo(c2.x1, -c2.y1, c2.x2, -c2.y2, c2.x, -c2.y);
      }
      const geo = new THREE.ExtrudeGeometry(sp.toShapes(true), { depth: LT.depth, bevelEnabled: LT.bevel > 0, bevelThickness: LT.bevel, bevelSize: LT.bevel * 0.6, bevelSegments: 2, curveSegments: 8 });
      geo.rotateX(-Math.PI / 2);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const c = new THREE.Vector3();
      bb.getCenter(c);
      geo.translate(-c.x, -bb.min.y - (bb.max.y - bb.min.y) / 2, -c.z);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      m.name = "g" + letters.length;
      const rest = [x + c.x, (bb.max.y - bb.min.y) / 2, L2.baseline + c.z, 0, 0, 0, 1];
      setPose(m, rest, 0);
      scene.add(m);
      letters.push(m);
      letterRest.push(rest);
    }
  });
}
const L = P.light.dir;
const Ld = new THREE.Vector3(L[0], L[1], L[2]).normalize();
const Lrest = P.light.restDir ? new THREE.Vector3(...P.light.restDir).normalize() : null;
const q160inv = new THREE.Quaternion(S.cam160[3], S.cam160[4], S.cam160[5], S.cam160[6]).normalize().invert();
function renderState(st) {
  const c = st.cam;
  setPose(cam, c, 0);
  cam.fov = c[7];
  cam.updateProjectionMatrix();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const tiltDeg = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, -fwd.y)));
  setPose(drone, st.drone, 0);
  drone.scale.setScalar(st.droneScale);
  planeText.visible = !OPT.compact;
  props.forEach((p, i) => {
    const PS = st.props[i];
    p.spin.rotation.y = PS.phi;
    if (p.v6) {
      const V = P.prop.v6, on = PS.on, sk = on ? [PS.streak, PS.gain] : null;
      p.v6.base.visible = on;
      p.v6.streak.visible = on && !!sk;
      if (sk) {
        p.v6.hold.rotation.y = -sk[0];
        p.v6.streak.material.opacity = Math.min(1, sk[1] / (V.gain ?? 1.4));
      }
      const dl = on && PS.dash || [];
      const U = p.v6.dash.material.uniforms;
      const nA = Math.min(dl.length, U.uA.value.length);
      for (let k = 0; k < nA; k++) {
        const a = dl[k];
        let sp = (a[2] - a[1]) % (2 * Math.PI);
        if (sp < 0) sp += 2 * Math.PI;
        U.uA.value[k].set(a[0], a[1], sp, a[3]);
        U.uB.value[k].set(a[4] || 0, a[5] || 0);
      }
      U.uN.value = nA;
      p.v6.dash.visible = nA > 0;
      p.blade.visible = true;
      p.blade.layers.set(on ? 5 : 4);
      p.fp.visible = on;
      p.fp.material.uniforms.uDelta.value = THREE.MathUtils.degToRad(V.discBlurDeg ?? 44);
      p.fp.material.uniforms.uOn.value = on ? 1 : 0;
      p.disc.visible = false;
      p.rings.forEach((r) => {
        r.visible = false;
      });
      return;
    }
    const f2 = S.propFmt >= 2;
    const dsc = f2 ? pr[4 + i] : pr[4], bv = f2 ? pr[8 + i] : pr[6], rg = f2 ? dsc : pr[5];
    const smO = P.prop.smearDiscOverrideDeg != null && dsc > 0.5 ? THREE.MathUtils.degToRad(P.prop.smearDiscOverrideDeg) : null;
    const sm = smO ?? (S.propFmt >= 3 ? pr[12 + i] : 0);
    const blur = sm > (P.prop.blurMin ?? 0.05);
    p.blade.visible = true;
    p.blade.layers.set(blur ? P.prop.discBladeShadowOnly && dsc > 0.5 ? 5 : 3 : 4);
    if (p.blade.userData.glint) p.blade.userData.glint.value = blur ? 1 : 0;
    p.fp.visible = blur;
    p.fp.material.uniforms.uDelta.value = sm;
    p.fp.material.uniforms.uOn.value = blur ? 1 : 0;
    p.disc.visible = dsc > 2e-3;
    p.disc.material.opacity = dsc * (P.prop.discOpacity ?? 1);
    p.rings.forEach((r, k) => {
      r.visible = rg > 2e-3;
      r.material.opacity = rg * P.prop.rings[k][2];
    });
  });
  letters.forEach((m, i) => {
    const s = st.letters[i];
    const pz = s || letterRest[i];
    setPose(m, pz, 0);
    const r = letterRest[i];
    const att = !!(s && s.length > 7 && s[7] > 0.5);
    const moved = !att && (Math.hypot(pz[0] - r[0], pz[1] - r[1], pz[2] - r[2]) > 0.5 || Math.abs(Math.abs(pz[6]) - 1) > 1e-4);
    m.castShadow = moved && (P.letters.shadow ?? true);
    const kd = moved ? 1 : Math.max(0.02, Math.min(1, tiltDeg / (P.letters.tiltFull ?? 41)));
    m.scale.set(1, kd, 1);
    if (!moved) m.position.y = r[1] * kd;
  });
  const tgt = new THREE.Vector3(drone.position.x, 0, drone.position.z);
  const Lnow = Lrest ? Lrest.clone().applyQuaternion(cam.quaternion.clone().multiply(q160inv)) : Ld;
  sun.target.position.copy(tgt);
  sun.position.copy(tgt).addScaledVector(Lnow, 4e3);
  sun.target.updateMatrixWorld();
  scene.updateMatrixWorld();
  cam.updateMatrixWorld();
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const anyBlur = props.some((p) => p.fp.visible);
  cam.layers.enableAll();
  renderer.clear();
  renderer.render(scene, cam);
  if (anyBlur) {
    cam.layers.set(0);
    cam.layers.enable(3);
    cam.layers.enable(4);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.copyFramebufferToTexture(backTex);
    props.forEach((p) => {
      if (p.fp.visible) p.fp.material.uniforms.uMVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(p.fp.matrixWorld);
    });
  }
  cam.layers.set(0);
  cam.layers.enable(4);
  renderer.clear();
  renderer.render(scene, cam);
  cam.layers.set(2);
  renderer.render(scene, cam);
  cam.layers.set(1);
  renderer.render(scene, cam);
  cam.layers.set(0);
  const cells = st.cells;
  for (let k = 0; k < cells.length; k++) {
    const v = Math.round(cells[k] * 255);
    cellData[4 * k] = v;
    cellData[4 * k + 1] = v;
    cellData[4 * k + 2] = v;
    cellData[4 * k + 3] = 255;
  }
  cellTex.needsUpdate = true;
  renderer.render(maskScene, maskCam);
  return true;
}
const CC = CP.cells;
const cellData = new Uint8Array(CC.nx * CC.ny * 4);
const cellTex = new THREE.DataTexture(cellData, CC.nx, CC.ny, THREE.RGBAFormat);
cellTex.magFilter = THREE.NearestFilter;
cellTex.minFilter = THREE.NearestFilter;
cellTex.flipY = false;
const VG = await (await fetch("data/vignette.json")).json();
const maskMat = new THREE.ShaderMaterial({
  uniforms: {
    tCell: { value: cellTex },
    uPR: { value: RPR },
    uGeo: { value: new THREE.Vector4(CC.ox, CC.oy, CC.cell, 0) },
    uN: { value: new THREE.Vector2(CC.nx, CC.ny) },
    uR: { value: VG.R },
    uG: { value: VG.G },
    uB: { value: VG.B }
  },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D tCell; uniform float uPR; uniform vec4 uGeo; uniform vec2 uN; uniform float uR[6]; uniform float uG[6]; uniform float uB[6];
    float poly(float c[6], float X, float Y){ return (c[0] + c[1]*X + c[2]*Y + c[3]*X*X + c[4]*X*Y + c[5]*Y*Y) / c[0]; }
    void main(){
      vec2 lp = vec2(gl_FragCoord.x / uPR, ${H}.0 - gl_FragCoord.y / uPR);
      vec2 ci = clamp(floor((lp - uGeo.xy) / uGeo.z), vec2(0.0), uN - 1.0);
      float a = texture2D(tCell, (ci + 0.5) / uN).r;
      float X = (lp.x - 477.5) / 477.5, Y = (lp.y - 358.5) / 358.5;
      gl_FragColor = vec4(poly(uR, X, Y) * a, poly(uG, X, Y) * a, poly(uB, X, Y) * a, a);
    }`,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.SrcColorFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.SrcAlphaFactor
});
const maskScene = new THREE.Scene();
const maskCam = new THREE.Camera();
{
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const m = new THREE.Mesh(g2, maskMat);
  m.frustumCulled = false;
  maskScene.add(m);
}
function clearRed() {
  renderer.setClearColor(0, 0);
  renderer.clear();
  renderer.setClearColor(0, 1);
}
const ready = true;
export {
  clearRed,
  ready,
  renderState
};
