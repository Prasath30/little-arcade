import * as THREE from 'three';
import {
  bridgeZ, buildLandscape, clamp, cottage, field, footpath, growField, height, homePlot,
  makeCloud, mix, riverCenter, riverWidth, suggestedPlot, tile, villager,
} from './landscape.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const stage = $('stage');
const cloudButton = $('cloud');
const hint = $('plot-hint');
const journal = [...$('objectives').children];
const toolbar = [...document.querySelectorAll('.tool')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveKey = 'little-harvest-village-v1';
const cottageCost = 6;
const names = ['Hazel', 'Rowan', 'Pip', 'Fern', 'Ellis', 'Mabel', 'Robin', 'Ivy'];
const tools = {
  field: ['Wheat field', 'Click or drag across the meadow to plant wheat.'],
  cottage: ['Cottage', 'Build on clear ground. A cottage costs 6 grain and welcomes two settlers.'],
  path: ['Footpath', 'Drag across the meadow to lay a path.'],
  rain: ['Rain cloud', 'Click a field to water it and help its wheat grow.'],
  hand: ['Look around', 'Drag to turn the view. Scroll or use + and − to zoom.'],
};

function readSave() {
  try {
    const save = JSON.parse(localStorage.getItem(saveKey));
    if (save && Number.isFinite(save.grain) && Number.isFinite(save.harvests) && Array.isArray(save.plots)) {
      return save;
    }
  } catch {
    // Browsing modes that block local storage can still run the game.
  }
  return { grain: 0, harvests: 0, plots: [] };
}

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.70));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.setClearColor(0xe5efcf, 0);
const scene = new THREE.Scene();
const sky = new THREE.HemisphereLight('#f5ffeb', '#a89b76', 1.86);
const sun = new THREE.DirectionalLight('#fff0cf', 2.50);
sun.position.set(-11, 16, 8);
sun.target.position.set(0, 0, -2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 19, bottom: -16, near: .3, far: 53 });
sun.shadow.normalBias = .035;
sun.shadow.radius = 3;
sun.shadow.bias = -.0003;
const fill = new THREE.DirectionalLight('#cbdedb', .46);
fill.position.set(8, 11, -12);
scene.add(sky, sun, sun.target, fill);

const camera = new THREE.OrthographicCamera(-14, 14, 9, -9, .1, 150);
const target = new THREE.Vector3(-.45, .9, -.75);
const { ground, waterClock } = buildLandscape(scene);
const structures = new THREE.Group();
const trails = new THREE.Group();
const settlers = new THREE.Group();
scene.add(structures, trails, settlers);
const starter = cottage(...homePlot, 0, true);
structures.add(starter);
const smoke = new THREE.Group();
const smokeShape = new THREE.IcosahedronGeometry(1, 2);
const smokePuffs = Array.from({ length: 7 }, (_, index) => {
  const material = new THREE.MeshBasicMaterial({
    color: '#f4edda', transparent: true, opacity: .2, depthWrite: false,
  });
  const puff = new THREE.Mesh(smokeShape, material);
  smoke.add(puff);
  return { puff, index };
});
starter.add(smoke);

for (let i = 0; i < 13; i++) {
  const t = i / 12;
  trails.add(footpath(mix(-3.87, riverCenter(bridgeZ) - riverWidth(bridgeZ) - .57, t),
    mix(-.80, bridgeZ, t) + Math.sin(t * 5) * .47, true));
}

const newSoil = new THREE.Color('#d4db9d');
const noSoil = new THREE.Color('#d28f70');
const wetSoil = new THREE.Color('#a6c9c4');
const lineMaterial = new THREE.LineBasicMaterial({ color: newSoil, transparent: true, opacity: .96, depthTest: true });
const previewGeo = new THREE.BufferGeometry();
const previewPosition = new THREE.Float32BufferAttribute(new Float32Array(36 * 3), 3);
previewGeo.setAttribute('position', previewPosition);
const preview = new THREE.LineLoop(previewGeo, lineMaterial);
preview.frustumCulled = false;
preview.visible = false;
scene.add(preview);
const cottagePreview = cottage(0, 0);
const ghostWalls = new THREE.MeshBasicMaterial({
  color: '#f5e9c1', transparent: true, opacity: .22, depthWrite: false,
});
cottagePreview.traverse((item) => {
  if (!item.isMesh) return;
  item.material = ghostWalls;
  item.castShadow = item.receiveShadow = false;
});
cottagePreview.visible = false;
scene.add(cottagePreview);
const hintPaint = new THREE.MeshBasicMaterial({
  color: '#f4e3ab', transparent: true, opacity: .16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
});
const hintGeometry = new THREE.PlaneGeometry(1.68, 1.68, 5, 5);
hintGeometry.rotateX(-Math.PI / 2);
const highlight = new THREE.Mesh(hintGeometry, hintPaint);
const hintPosition = hintGeometry.attributes.position;
for (let i = 0; i < hintPosition.count; i++) {
  hintPosition.setY(i, height(suggestedPlot[0] + hintPosition.getX(i), suggestedPlot[1] + hintPosition.getZ(i)) + .042);
}
highlight.position.set(suggestedPlot[0], 0, suggestedPlot[1]);
scene.add(highlight);

const cloud = makeCloud();
scene.add(cloud.group);
const dropCount = 92;
const rainGeometry = new THREE.BufferGeometry();
const rainPosition = new THREE.Float32BufferAttribute(new Float32Array(dropCount * 6), 3);
rainGeometry.setAttribute('position', rainPosition);
const drops = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({
  color: '#dfeee1', transparent: true, opacity: .87,
}));
drops.frustumCulled = false;
scene.add(drops);
const raindrop = Array.from({ length: dropCount }, (_, i) => [
  Math.sin(i * 8.123) * 1.27, Math.cos(i * 12.43) * .96, (i * .6180339) % 1,
]);
const rainAt = [-.1, -5.4];
const cloudHome = [5.5, 2.0];
let cloudDrag = null;
let rainUntil = 0;
let state = readSave();
let active = 'field';
let yaw = .53;
let pitch = .63;
let zoom = 1;
let time = 0;
let clock = 0;
let elapsed = 0;
let toastUntil = 0;
let lastSave = 0;
let enabledSound = false;
let audioContext;
const objects = new Map();
const workers = [];
const passed = new Map();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const world = new THREE.Vector3();
const display = new THREE.Vector3();
const initialColor = new THREE.Color('#f5f1df');
const rainColor = new THREE.Color('#d1ded5');
const defaultCloudLabel = 'Rain cloud';

function sound(melody) {
  if (!enabledSound || !audioContext) return;
  const start = audioContext.currentTime;
  melody.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const onset = start + index * .090;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, onset);
    gain.gain.exponentialRampToValueAtTime(.096, onset + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, onset + .30);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(onset);
    oscillator.stop(onset + .31);
  });
}

function hidePreview() {
  preview.visible = false;
  cottagePreview.visible = false;
}

function useTool(kind) {
  active = kind;
  canvas.dataset.tool = kind;
  hidePreview();
  toolbar.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tool === kind)));
  $('tool-name').textContent = tools[kind][0];
  $('tool-tip').textContent = tools[kind][1];
}

function save() {
  try {
    localStorage.setItem(saveKey, JSON.stringify(state));
  } catch {
    // Progress lives for the current tab when storage is unavailable.
  }
}

function toast(text, forSeconds = 3.7) {
  const element = $('toast');
  element.textContent = text;
  element.hidden = false;
  toastUntil = elapsed + forSeconds;
}

function key(x, z) {
  return `${Math.round(x / tile)},${Math.round(z / tile)}`;
}

function refreshUI() {
  const hasField = state.plots.some(({ kind }) => kind === 'field');
  const cottages = state.plots.filter(({ kind }) => kind === 'cottage').length;
  const goals = [hasField, state.harvests > 0, cottages > 0];
  const next = goals.indexOf(false);
  $('settler-count').textContent = 3 + cottages * 2;
  $('grain-count').textContent = state.grain;
  $('cottage-count').textContent = cottages + 1;
  $('chapter').textContent = next === -1 ? 'A village is growing' : 'The first harvest';
  journal.forEach((entry, i) => {
    entry.classList.toggle('done', goals[i]);
    entry.classList.toggle('current', i === next);
    if (i === next) entry.setAttribute('aria-current', 'step');
    else entry.removeAttribute('aria-current');
    entry.children[0].innerHTML = goals[i] ? '<svg aria-hidden="true"><use href="#check"></use></svg>' : '';
  });
  highlight.visible = !hasField;
  hint.classList.toggle('ready', !hasField && active === 'field');
}

function addWorker(home, index) {
  const figure = villager(index);
  const x = home[0] + (index % 3 - 1) * .48;
  const z = home[1] + 1.12 + (index % 2) * .35;
  settlers.add(figure.body);
  workers.push({
    ...figure, index, home, x, z, angle: index * 1.2, gait: index * 2,
    waitUntil: elapsed + .8 + index * .23, path: [], job: null, carrying: '',
  });
}

function install(record, animate = true) {
  const { x, z, kind } = record;
  let visual;
  if (kind === 'field') {
    visual = field(x, z, (Math.round(x * 19947 + z * 21732) + 16271) >>> 0);
    growField(visual, record.growth, record.moisture, time);
  } else if (kind === 'cottage') {
    const placed = state.plots.filter((item) => item.kind === 'cottage').indexOf(record);
    visual = { group: cottage(x, z, placed + 1) };
    addWorker([x, z], workers.length);
    addWorker([x, z], workers.length);
  } else {
    visual = { group: footpath(x, z) };
  }
  visual.record = record;
  visual.born = animate ? elapsed : -100;
  structures.add(visual.group);
  objects.set(key(x, z), visual);
}

function restore() {
  settlers.clear();
  workers.length = 0;
  for (let i = 0; i < 3; i++) addWorker(homePlot, i);
  for (const { group } of objects.values()) structures.remove(group);
  objects.clear();
  for (const record of state.plots) install(record, false);
  refreshUI();
}

function checkPlacement(x, z, kind) {
  if (kind === 'rain') return objects.get(key(x, z))?.record.kind === 'field' ? '' : 'Rain works best right over a wheat field.';
  if (Math.abs(x) > 9.01 || z < -7.21 || z > 7.21) return 'Build in the meadow by the creek.';
  if (Math.abs(x - riverCenter(z)) < riverWidth(z) + 1.07 || height(x, z) < .03) return 'Find a spot on dry ground.';
  if (Math.hypot(x - homePlot[0], z - homePlot[1]) < (kind === 'cottage' ? 2.25 : 1.13)) return 'Give the cottage a little room.';
  const previous = objects.get(key(x, z));
  if (previous?.record.kind === kind) return 'Already placed here.';
  if (previous && previous.record.kind !== 'path') return 'That plot is already in use.';
  if (kind === 'cottage' && state.grain < cottageCost) return 'Gather 6 grain to build a cottage.';
  if (kind === 'cottage' && state.plots.some((plot) => plot.kind === 'cottage' && Math.hypot(x - plot.x, z - plot.z) < 2.25)) {
    return 'Give the neighboring cottage a little room.';
  }
  return '';
}

function apply(x, z, kind = active, speak = true) {
  if (kind === 'hand') return;
  const failure = checkPlacement(x, z, kind);
  if (failure) {
    if (speak) toast(failure);
    return;
  }
  if (kind === 'rain') {
    const record = objects.get(key(x, z)).record;
    record.moisture = 1;
    rainAt[0] = x;
    rainAt[1] = z;
    rainUntil = elapsed + 3.4;
    toast('A little rain for the wheat.');
    sound([440, 523, 660]);
    return;
  }
  const previous = objects.get(key(x, z));
  if (previous) {
    structures.remove(previous.group);
    state.plots.splice(state.plots.indexOf(previous.record), 1);
  }
  const first = kind === 'field' && !state.plots.some((plot) => plot.kind === 'field');
  const record = { kind, x, z };
  if (kind === 'field') Object.assign(record, { growth: .055, moisture: .35 });
  if (kind === 'cottage') state.grain -= cottageCost;
  state.plots.push(record);
  install(record);
  hidePreview();
  if (first) toast('Wheat planted. Your settlers are on their way.');
  if (kind === 'cottage') toast('Two new settlers have made Willowbrook their home.', 4.8);
  if (kind === 'field') sound([392, 523]);
  if (kind === 'cottage') sound([392, 523, 659, 784]);
  refreshUI();
  save();
}

function setCamera() {
  const radius = 33;
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * radius,
    target.y + Math.sin(pitch) * radius,
    target.z + Math.cos(yaw) * Math.cos(pitch) * radius,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function resize() {
  const width = stage.clientWidth;
  const hh = stage.clientHeight;
  const aspect = width / hh;
  const viewHeight = aspect >= 1 ? Math.max(18, 26.5 / aspect) : Math.min(24, 18.6 / aspect);
  camera.left = -viewHeight * aspect / 2;
  camera.right = -camera.left;
  camera.top = viewHeight / 2;
  camera.bottom = -camera.top;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  renderer.setSize(width, hh, false);
}

function setZoom(value) {
  zoom = clamp(value, .71, 1.90);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

function recenter() {
  yaw = .53;
  pitch = .63;
  setCamera();
  setZoom(1);
}

function hit(clientX, clientY) {
  const { left, top, width, height: hh } = canvas.getBoundingClientRect();
  ndc.set((clientX - left) / width * 2 - 1, 1 - (clientY - top) / hh * 2);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(ground, false)[0]?.point;
}

function snapped(point) {
  return [Math.round(point.x / tile) * tile, Math.round(point.z / tile) * tile];
}

function showPreview(x, z) {
  preview.visible = active !== 'hand';
  const size = active === 'rain' ? .90 : .85;
  const okay = !checkPlacement(x, z, active);
  cottagePreview.visible = active === 'cottage' && okay;
  if (cottagePreview.visible) cottagePreview.position.set(x, height(x, z), z);
  lineMaterial.color.copy(okay ? active === 'rain' ? wetSoil : newSoil : noSoil);
  for (let i = 0; i < previewPosition.count; i++) {
    const a = i / previewPosition.count * Math.PI * 2;
    const r = size / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    previewPosition.setXYZ(i, px, height(px, pz) + .085, pz);
  }
  previewPosition.needsUpdate = true;
}

let pointer = null;
let keyboardPlot = [...suggestedPlot];
function dragApply(point, speak) {
  const [x, z] = snapped(point);
  const cell = key(x, z);
  if (pointer.cells.has(cell)) return;
  pointer.cells.add(cell);
  apply(x, z, active, speak);
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('pointerdown', (event) => {
  if (pointer || (event.button !== 0 && event.button !== 2)) return;
  const orbit = event.button === 2 || event.shiftKey || active === 'hand';
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, orbit, cells: new Set() };
  canvas.setPointerCapture(event.pointerId);
  if (orbit) canvas.classList.add('dragging');
  const point = hit(event.clientX, event.clientY);
  if (point && !orbit) dragApply(point, true);
});
canvas.addEventListener('pointermove', (event) => {
  if (pointer && pointer.id !== event.pointerId) return;
  if (pointer?.orbit) {
    yaw -= (event.clientX - pointer.x) * .006;
    pitch = clamp(pitch + (event.clientY - pointer.y) * .005, .35, 1.15);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    setCamera();
    return;
  }
  if (active === 'hand') return;
  const point = hit(event.clientX, event.clientY);
  if (!point) {
    hidePreview();
    return;
  }
  keyboardPlot = snapped(point);
  showPreview(...keyboardPlot);
  if (pointer && (active === 'field' || active === 'path')) dragApply(point, false);
});
canvas.addEventListener('lostpointercapture', () => {
  pointer = null;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('pointerleave', hidePreview);
canvas.addEventListener('wheel', (event) => {
  if (stage.clientWidth < 640 && !event.ctrlKey) return;
  event.preventDefault();
  setZoom(zoom * Math.exp(-event.deltaY * .0011));
}, { passive: false });
canvas.tabIndex = 0;
canvas.addEventListener('keydown', (event) => {
  const moves = { ArrowLeft: [-tile, 0], ArrowRight: [tile, 0], ArrowUp: [0, -tile], ArrowDown: [0, tile] };
  if (moves[event.key]) {
    event.preventDefault();
    const [dx, dz] = moves[event.key];
    keyboardPlot = [clamp(keyboardPlot[0] + dx, -9, 9), clamp(keyboardPlot[1] + dz, -7.2, 7.2)];
    showPreview(...keyboardPlot);
  }
  if (['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    apply(...keyboardPlot);
  }
});
canvas.addEventListener('blur', hidePreview);

let cloudGesture = null;
cloudButton.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  cloudGesture = { x: event.clientX, y: event.clientY };
  cloudButton.setPointerCapture(event.pointerId);
  useTool('rain');
});
cloudButton.addEventListener('pointermove', (event) => {
  if (!cloudGesture || Math.hypot(event.clientX - cloudGesture.x, event.clientY - cloudGesture.y) < 6) return;
  const point = hit(event.clientX, event.clientY);
  if (!point) return;
  cloudDrag = [point.x, point.z];
  showPreview(...snapped(point));
});
cloudButton.addEventListener('pointerup', () => {
  if (cloudDrag) apply(...snapped({ x: cloudDrag[0], z: cloudDrag[1] }), 'rain');
});
cloudButton.addEventListener('lostpointercapture', () => {
  cloudGesture = null;
  cloudDrag = null;
  hidePreview();
});
cloudButton.addEventListener('click', () => useTool('rain'));

toolbar.forEach((button) => button.addEventListener('click', () => useTool(button.dataset.tool)));
window.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || $('reset-dialog').open) return;
  const button = toolbar[Number(event.key) - 1];
  if (button) useTool(button.dataset.tool);
});
$('zoom-in').onclick = () => setZoom(zoom * 1.19);
$('zoom-out').onclick = () => setZoom(zoom / 1.19);
$('recenter').onclick = recenter;
$('new-game').onclick = () => {
  $('reset-dialog').returnValue = '';
  $('reset-dialog').showModal();
};
$('reset-dialog').addEventListener('close', (event) => {
  if (event.target.returnValue !== 'reset') return;
  state = { grain: 0, harvests: 0, plots: [] };
  for (const path of passed.values()) if (path.mesh) trails.remove(path.mesh);
  passed.clear();
  rainUntil = 0;
  restore();
  recenter();
  useTool('field');
  save();
  toast('A fresh start in Willowbrook.');
});
$('sound').onclick = async () => {
  enabledSound = !enabledSound;
  if (enabledSound) {
    audioContext ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (audioContext.state !== 'running') await audioContext.resume();
    sound([392, 523, 660]);
  }
  const label = enabledSound ? 'Turn off sound' : 'Turn on sound';
  $('sound').setAttribute('aria-pressed', String(enabledSound));
  $('sound').setAttribute('aria-label', label);
  $('sound').title = label;
  $('sound').querySelector('use').setAttribute('href', enabledSound ? '#volume' : '#mute');
};
window.addEventListener('pagehide', save);

function onEast(x, z) {
  return x > riverCenter(z);
}

function edge(z, towardEast) {
  return [riverCenter(z) + (towardEast ? 1 : -1) * (riverWidth(z) + .58), z];
}

function walkTo(worker, x, z) {
  const startEast = onEast(worker.x, worker.z);
  const destinationEast = onEast(x, z);
  const waypoints = [];
  if (startEast !== destinationEast) {
    waypoints.push(edge(bridgeZ, startEast), [riverCenter(bridgeZ), bridgeZ],
      edge(bridgeZ, destinationEast));
  }
  waypoints.push([x, z]);
  worker.path = waypoints;
}

function goHome(worker) {
  walkTo(worker, worker.home[0] - .16 + (worker.index % 3 - 1) * .31, worker.home[1] + 1.22);
}

function chooseJob(worker, fields) {
  const close = (visual) => Math.hypot(visual.record.x - worker.x, visual.record.z - worker.z);
  const ready = fields.filter((visual) => visual.record.growth >= 1 && !visual.worker).sort((a, b) => close(a) - close(b))[0];
  if (ready) {
    ready.worker = worker;
    worker.job = { kind: 'pick', visual: ready };
    walkTo(worker, ready.record.x, ready.record.z + .48);
    return;
  }
  const thirsty = fields.filter((visual) =>
    visual.record.growth < .95 && !visual.waterer && visual.record.moisture < .6)
    .sort((a, b) => close(a) - close(b))[0];
  if (thirsty) {
    thirsty.waterer = worker;
    worker.job = { kind: 'fetch', visual: thirsty };
    const z = clamp(thirsty.record.z + .43, -6.8, 6.8);
    walkTo(worker, ...edge(z, onEast(worker.x, worker.z)));
    return;
  }
  const phase = worker.index * 3.3 + elapsed * .8;
  const x = worker.home[0] + Math.sin(phase) * (1.25 + worker.index % 3 * .3);
  const z = worker.home[1] + 1.3 + Math.cos(phase) * 1.06;
  worker.job = { kind: 'wander' };
  walkTo(worker, x, z);
}

function finishLeg(worker) {
  switch (worker.job?.kind) {
    case 'pick': {
      worker.job.kind = 'picking';
      worker.waitUntil = elapsed + .85;
      break;
    }
    case 'picking': {
      worker.job.visual.cut = true;
      worker.carrying = 'grain';
      worker.job.kind = 'deliver';
      goHome(worker);
      break;
    }
    case 'deliver': {
      const { visual } = worker.job;
      visual.record.growth = .07;
      visual.worker = null;
      visual.cut = false;
      state.grain += 8;
      state.harvests++;
      const name = names[worker.index % names.length];
      if (state.harvests === 1) toast(`${name} brought home the first harvest! You can build a cottage now.`, 6);
      else toast(`${name} brought in 8 grain.`, 2.7);
      sound([523, 659, 784, 1047]);
      worker.carrying = '';
      worker.job = null;
      worker.waitUntil = elapsed + 1.1;
      refreshUI();
      save();
      break;
    }
    case 'fetch': {
      worker.carrying = 'water';
      worker.job.kind = 'water';
      const { x, z } = worker.job.visual.record;
      walkTo(worker, x + .55, z + .55);
      break;
    }
    case 'water': {
      worker.job.visual.record.moisture = clamp(worker.job.visual.record.moisture + .46, 0, 1);
      worker.job.visual.waterer = null;
      worker.carrying = '';
      worker.job.kind = 'rest';
      goHome(worker);
      break;
    }
    default: {
      worker.job = null;
      worker.waitUntil = elapsed + 1.4 + worker.index % 3 * .38;
    }
  }
}

function leaveFootprint(worker) {
  if (elapsed < (worker.stepAt ?? 0) || worker.job?.kind === 'wander') return;
  worker.stepAt = elapsed + .28;
  const { x, z } = worker;
  if (Math.abs(x - riverCenter(z)) < riverWidth(z) + .4 || height(x, z) < .10) return;
  if (objects.get(key(x, z))?.record.kind === 'field') return;
  const spotX = Math.round(x * 2) / 2;
  const spotZ = Math.round(z * 2) / 2;
  const id = `${spotX},${spotZ}`;
  if (passed.size > 650 && !passed.has(id)) return;
  const count = passed.get(id) ?? { visits: 0 };
  count.visits++;
  if (count.visits === 4) {
    count.mesh = footpath(spotX, spotZ, true);
    trails.add(count.mesh);
  }
  passed.set(id, count);
}

function animateWorker(worker, dt, fields) {
  const destination = worker.path[0];
  if (destination) {
    const [x, z] = destination;
    const dx = x - worker.x;
    const dz = z - worker.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(distance, dt * (1.32 + (worker.index % 4) * .09));
    if (distance > .001) {
      worker.x += dx / distance * step;
      worker.z += dz / distance * step;
      const look = Math.atan2(dx, dz);
      worker.angle += Math.atan2(Math.sin(look - worker.angle), Math.cos(look - worker.angle)) * Math.min(1, dt * 12);
    }
    if (distance <= .025) {
      worker.path.shift();
      if (!worker.path.length) finishLeg(worker);
    }
    worker.gait += dt * 12;
    leaveFootprint(worker);
  } else if (elapsed >= worker.waitUntil) {
    if (worker.job) finishLeg(worker);
    else chooseJob(worker, fields);
  }
  const { x, z } = worker;
  let y = height(x, z) + .022;
  const offset = Math.abs(x - riverCenter(bridgeZ));
  const bridgeSpan = riverWidth(bridgeZ) + .75;
  if (Math.abs(z - bridgeZ) < .45 && offset < bridgeSpan) {
    y = Math.max(y, .28 + Math.cos(offset / bridgeSpan * Math.PI / 2) * .29);
  }
  const walking = Boolean(worker.path.length) && !reducedMotion;
  const working = worker.job?.kind === 'picking' && !reducedMotion;
  worker.body.position.set(x, y + (walking ? Math.abs(Math.sin(worker.gait)) * .050 : 0), z);
  worker.body.rotation.set(working ? .24 + .13 * Math.sin(clock * 15) : 0, worker.angle, 0);
  for (let i = 0; i < 2; i++) {
    const swing = walking ? Math.sin(worker.gait + Math.PI * i) * .52 : 0;
    worker.legs[i].rotation.x = swing;
    worker.arms[i].rotation.x = worker.carrying ? -.76 : working ? -.27 + Math.sin(clock * 16 + i) * .29 : -swing * .65;
  }
  worker.basket.visible = worker.carrying === 'grain';
  worker.bucket.visible = worker.carrying === 'water';
}

function animateCloud(dt) {
  const raining = elapsed < rainUntil;
  const [x, z] = cloudDrag ?? (raining ? rainAt : cloudHome);
  const y = height(x, z) + (cloudDrag || raining ? 3.05 : 4.25);
  cloud.group.position.lerp(world.set(x, y + Math.sin(time * 1.26) * .11, z), Math.min(1, .12 + dt * 3.1));
  cloud.group.scale.setScalar(raining ? 1.10 : 1);
  cloud.material.color.copy(raining ? rainColor : initialColor);
  drops.visible = raining;
  if (raining) {
    for (let i = 0; i < raindrop.length; i++) {
      const [xOffset, zOffset, phase] = raindrop[i];
      const yy = y - ((phase + clock * 1.93) % 1) * 2.75;
      rainPosition.setXYZ(i * 2, x + xOffset, yy, z + zOffset);
      rainPosition.setXYZ(i * 2 + 1, x + xOffset - .07, yy - .24, z + zOffset);
    }
    rainPosition.needsUpdate = true;
  }
  display.copy(cloud.group.position);
  display.y += .8;
  placeLabel(cloudButton, display, true);
  const label = raining ? 'Raining' : defaultCloudLabel;
  const text = cloudButton.querySelector('span');
  if (text.textContent !== label) text.textContent = label;
}

function placeLabel(label, position, pin = false) {
  position.project(camera);
  const width = stage.clientWidth;
  const hh = stage.clientHeight;
  const x = (position.x + 1) * width / 2;
  const y = (1 - position.y) * hh / 2;
  if (pin) {
    label.classList.toggle('ready', x > 30 && x < width - 30 && y > 18 && y < hh - 20);
  }
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
}

restore();
useTool('field');
setCamera();
new ResizeObserver(resize).observe(stage);
resize();

let frame = performance.now();
let lastCrops = 0;
renderer.setAnimationLoop((now) => {
  const dt = clamp((now - frame) / 1000, 0, .06);
  frame = now;
  elapsed += dt;
  clock += dt;
  if (!reducedMotion) time += dt;
  waterClock.value = time;
  const redrawCrops = elapsed - lastCrops > .08;
  const fields = [];
  for (const visual of objects.values()) {
    const { record, group, born } = visual;
    if (record.kind === 'field') {
      record.growth = clamp(record.growth + dt * (.039 + record.moisture * .067), 0, 1);
      record.moisture = clamp(record.moisture - dt * .017, 0, 1);
      if (redrawCrops) growField(visual, visual.cut ? .035 : record.growth, record.moisture, time);
      fields.push(visual);
    }
    if (!reducedMotion && record.kind !== 'path' && elapsed - born < .53) {
      const t = (elapsed - born) / .53;
      const pop = 1 - (1 - t) ** 3 + Math.sin(t * Math.PI) * .10;
      group.scale.set(1, Math.max(.02, pop), 1);
    } else if (group.scale.y !== 1) {
      group.scale.setScalar(1);
    }
  }
  if (redrawCrops) lastCrops = elapsed;
  for (const worker of workers) animateWorker(worker, dt, fields);
  smoke.visible = !reducedMotion;
  for (const { puff, index } of smokePuffs) {
    const phase = (time * .33 + index / smokePuffs.length) % 1;
    puff.position.set(.47 + phase ** 1.5 * .89, 2.45 + phase * 1.65, -.49 - phase * .35 + Math.sin(time + index) * phase * .18);
    puff.scale.setScalar(.07 + phase * .32);
    puff.material.opacity = Math.sin(Math.PI * phase) * .19;
  }
  animateCloud(dt);
  hint.classList.toggle('ready', highlight.visible && active === 'field');
  if (hint.classList.contains('ready')) {
    const [x, z] = suggestedPlot;
    placeLabel(hint, display.set(x, height(x, z) + .14, z));
    hintPaint.opacity = .14 + Math.sin(time * 2) * .036;
  }
  if (elapsed > toastUntil && !$('toast').hidden) $('toast').hidden = true;
  if (elapsed - lastSave > 4) {
    save();
    lastSave = elapsed;
  }
  renderer.render(scene, camera);
});
