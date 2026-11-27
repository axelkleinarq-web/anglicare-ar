import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
let DATA, root, buildings = {}, meshes = [], ground, sun, hemi, renderer, scene, camera, mode = null;
let mindar = null, selected = null, tracking = false;

// ---------------------------------------------------------------- model
const COLORS = { res: 0xf4f2ee, podium: 0xb9b6b0, balcony: 0xdedcd8, plant: 0x7d7d7d, glass: 0x7fd3e8 };

async function loadData() {
  DATA = await (await fetch('assets/model.json')).json();
  const lv = {};
  for (const [l, b, k] of DATA.items) {
    if (k === 'res' || k === 'podium' || k === 'glass') (lv[b] ||= new Set()).add(l);
  }
  for (const b in DATA.buildings) DATA.buildings[b].storeysCounted = lv[b] ? lv[b].size : 0;
}

function buildModel() {
  root = new THREE.Group();
  // model metres -> tracker units (tracker width = 1, centred, +Y up, +Z out of page)
  root.scale.setScalar(DATA.scale);
  root.position.set(DATA.offset[0], DATA.offset[1], 0);

  const mats = {};
  const mat = (b, k) => {
    const key = b + k;
    if (!mats[key]) {
      mats[key] = new THREE.MeshStandardMaterial({
        color: COLORS[k], roughness: k === 'glass' ? 0.1 : 0.85, metalness: 0,
        transparent: k === 'glass', opacity: k === 'glass' ? 0.45 : 1, depthWrite: k !== 'glass',
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
    }
    return mats[key];
  };
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.55 });

  for (const b in DATA.buildings) {
    const g = new THREE.Group(); g.name = b; root.add(g);
    buildings[b] = { group: g, mats: new Set(), items: [] };
  }
  for (const [lv, b, k, z0, z1, poly] of DATA.items) {
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(z1 - z0, 0.05), bevelEnabled: false });
    geo.translate(0, 0, z0);
    const m = mat(b, k);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = k !== 'glass'; mesh.receiveShadow = true;
    mesh.userData = { b, lv, k };
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lineMat);
    mesh.add(edges);
    buildings[b].group.add(mesh);
    buildings[b].mats.add(m);
    buildings[b].items.push(mesh);
    meshes.push(mesh);
  }
  // shadow catcher over the site (metres, model frame)
  const gGeo = new THREE.PlaneGeometry(260, 220);
  gGeo.translate(76, 68, 0.03);
  ground = new THREE.Mesh(gGeo, new THREE.ShadowMaterial({ opacity: 0.38 }));
  ground.receiveShadow = true;
  root.add(ground);
  return root;
}

// ---------------------------------------------------------------- sun (SunCalc formulae)
const RAD = Math.PI / 180;
function sunPosition(dateUTC, lat, lng) {
  const d = dateUTC.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;
  const M = RAD * (357.5291 + 0.98560028 * d);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  const e = RAD * 23.4397;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const lw = RAD * -lng, phi = RAD * lat;
  const H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI; // from north, clockwise
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  return { az, alt };
}
const DST = { '6-21': 10, '3-21': 11, '9-23': 10, '12-21': 11 }; // AEST / AEDT offsets

function sunDirModel() {
  // direction from model towards the sun, in model metres frame (x,y plan, z up)
  if (!$('sunOn').checked) return new THREE.Vector3(0.35, 0.5, 1).normalize();
  const [mo, da] = $('sunDate').value.split('-').map(Number);
  const t = parseFloat($('sunTime').value), off = DST[$('sunDate').value];
  const y = new Date().getFullYear();
  const utc = new Date(Date.UTC(y, mo - 1, da, 0, 0) + (t - off) * 3600000);
  const { az, alt } = sunPosition(utc, DATA.lat, DATA.lon);
  const th = DATA.northDeg * RAD;
  const N = new THREE.Vector2(Math.cos(th), Math.sin(th));
  const E = new THREE.Vector2(Math.sin(th), -Math.cos(th));
  const h = N.multiplyScalar(Math.cos(az)).add(E.multiplyScalar(Math.sin(az)));
  const ca = Math.cos(Math.max(alt, 0.02));
  return new THREE.Vector3(h.x * ca, h.y * ca, Math.sin(Math.max(alt, 0.02))).normalize();
}

const _box = new THREE.Box3(), _sph = new THREE.Sphere(), _v = new THREE.Vector3();
function updateSun() {
  if (!root || !sun) return;
  root.updateMatrixWorld(true);
  _box.makeEmpty(); for (const b in buildings) _box.expandByObject(buildings[b].group, true);
  _box.getBoundingSphere(_sph);
  const dir = sunDirModel().transformDirection(root.matrixWorld);
  const r = Math.max(_sph.radius, 1e-6);
  sun.target.position.copy(_sph.center);
  sun.position.copy(_sph.center).addScaledVector(dir, r * 3);
  sun.target.updateMatrixWorld();
  const c = sun.shadow.camera;
  c.left = -r * 1.3; c.right = r * 1.3; c.top = r * 1.3; c.bottom = -r * 1.3;
  sun.shadow.normalBias = r * 0.006;
  c.near = r * 0.5; c.far = r * 6; c.updateProjectionMatrix();
  sun.castShadow = $('sunOn').checked;
  sun.intensity = $('sunOn').checked ? 2.2 : 1.4;
  ground.visible = $('sunOn').checked;
}

function addLights(sc) {
  hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1);
  sc.add(hemi);
  sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.0;
  sc.add(sun); sc.add(sun.target);
}

// ---------------------------------------------------------------- tracking smoothing (One-Euro filter)
// level 0 = tightest lock (most responsive, more jitter) ... 6 = smoothest (more lag)
const SMOOTH = [[0.01, 3000], [0.001, 1000], [0.001, 300], [0.0005, 100], [0.0003, 30], [0.0002, 10], [0.0001, 1]];
function smoothLevel() { return parseInt($('smooth').value); }
function applySmoothing() {
  const [cf, beta] = SMOOTH[smoothLevel()];
  try { localStorage.setItem('arSmooth', String(smoothLevel())); } catch (e) {}
  const ctl = mindar && mindar.controller;
  if (ctl && ctl.trackingStates) for (const st of ctl.trackingStates) { st.filter.minCutOff = cf; st.filter.beta = beta; }
  if (ctl) { ctl.filterMinCF = cf; ctl.filterBeta = beta; }
}
try { const v = localStorage.getItem('arSmooth'); if (v !== null) document.getElementById('smooth').value = v; } catch (e) {}

// ---------------------------------------------------------------- UI
function applyLevel() {
  const L = parseInt($('level').value), max = parseInt($('level').max);
  $('levelVal').textContent = L >= max ? 'All' : (L === 0 ? 'GF' : 'L' + L);
  for (const m of meshes) m.visible = L >= max || m.userData.lv <= L && m.userData.k !== 'plant';
}
function sunLabel() {
  const t = parseFloat($('sunTime').value), h = Math.floor(t), mi = Math.round((t - h) * 60);
  $('sunVal').textContent = `${h}:${String(mi).padStart(2, '0')}`;
}
function select(b) {
  if (selected) for (const m of buildings[selected].mats) m.emissive.setHex(0x000000);
  selected = b;
  const card = $('info');
  if (!b) { card.classList.add('hidden'); return; }
  for (const m of buildings[b].mats) m.emissive.setHex(0x1d4f7a);
  const d = DATA.buildings[b];
  card.innerHTML = `<button class="x" id="infoX">✕</button><h3>${d.name}</h3>
    <table><tr><td>Storeys (incl. GF)</td><td>${d.storeysCounted}</td></tr>
    <tr><td>Height above RL ${d.baseRL.toFixed(2)}</td><td>${(d.topRL - d.baseRL).toFixed(1)} m</td></tr>
    <tr><td>Top of building (AHD)</td><td>RL ${d.topRL.toFixed(2)}</td></tr>
    <tr><td>Base level (AHD)</td><td>RL ${d.baseRL.toFixed(2)}</td></tr></table>`;
  card.classList.remove('hidden');
  $('infoX').onclick = () => select(null);
}
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function onTap(ev) {
  if (ev.target.closest && (ev.target.closest('#controls') || ev.target.closest('.card') || ev.target.closest('.chip'))) return;
  const t = ev.changedTouches ? ev.changedTouches[0] : ev;
  const rect = renderer.domElement.getBoundingClientRect();
  ptr.set(((t.clientX - rect.left) / rect.width) * 2 - 1, -((t.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(meshes.filter(m => m.visible), false)[0];
  select(hit ? hit.object.userData.b : null);
}
let downAt = null;
window.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
window.addEventListener('pointerup', e => {
  if (!mode || !downAt) return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 8) onTap(e);
  downAt = null;
});

function wireControls() {
  $('level').oninput = applyLevel;
  $('smooth').oninput = applySmoothing;
  for (const id of ['sunOn', 'sunDate', 'sunTime']) $(id).oninput = () => { sunLabel(); updateSun(); };
  $('sunDate').onchange = () => { sunLabel(); updateSun(); };
  $('btnBack').onclick = () => location.reload();
  const maxLv = Math.max(...DATA.items.map(i => i[0]));
  $('level').max = maxLv; $('level').value = maxLv;
  applyLevel(); sunLabel();
}

// ---------------------------------------------------------------- AR mode
async function startAR() {
  mode = 'ar';
  $('home').classList.add('hidden'); $('ui').classList.remove('hidden');
  const { MindARThree } = await import('mindar-image-three');
  mindar = new MindARThree({
    container: stage, imageTargetSrc: 'assets/targets.mind', maxTrack: 1,
    filterMinCF: SMOOTH[smoothLevel()][0], filterBeta: SMOOTH[smoothLevel()][1], warmupTolerance: 3, missTolerance: 5,
    uiLoading: 'yes', uiScanning: 'no', uiError: 'yes',
  });
  ({ renderer, scene, camera } = mindar);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  addLights(scene);
  // target 0 = B&W tracker print, target 1 = original colour DA-100 print (same crop, same registration)
  const model = buildModel();
  const labels = ['DA‑100 plan (B&W)', 'DA‑100 plan (colour)'];
  for (let i = 0; i < 2; i++) {
    const anchor = mindar.addAnchor(i);
    anchor.onTargetFound = () => { anchor.group.add(model); tracking = true; $('status').textContent = 'Tracking ' + labels[i]; };
    anchor.onTargetLost = () => { tracking = false; $('status').textContent = 'Point at the plan…'; };
  }
  wireControls();
  try {
    await mindar.start();
    applySmoothing();
  } catch (e) {
    $('status').textContent = 'Camera unavailable: ' + (e.message || e);
    return;
  }
  renderer.setAnimationLoop(() => { if (tracking) updateSun(); renderer.render(scene, camera); });
}

// ---------------------------------------------------------------- preview mode (desktop / no camera)
async function startPreview() {
  mode = 'preview';
  $('home').classList.add('hidden'); $('ui').classList.remove('hidden');
  $('status').textContent = '3D preview · drag to orbit, pinch to zoom';
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe3e6);
  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(0.25, -1.55, 1.15);
  addLights(scene);
  // the printed tracker as a sheet of paper
  const tex = await new THREE.TextureLoader().loadAsync('assets/tracker.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = tex.image.height / tex.image.width;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, aspect), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  paper.receiveShadow = true;
  scene.add(paper);
  scene.add(buildModel());
  const ctl = new OrbitControls(camera, renderer.domElement);
  ctl.target.set(0, 0, 0.03); ctl.update();
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  });
  wireControls(); updateSun();
  renderer.setAnimationLoop(() => { ctl.update(); renderer.render(scene, camera); });
}

// ---------------------------------------------------------------- boot
await loadData();
$('btnAR').onclick = startAR;
$('btnPreview').onclick = startPreview;
const q = new URLSearchParams(location.search);
if (q.has('preview')) startPreview();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
window.__app = { get selected() { return selected; }, select };
