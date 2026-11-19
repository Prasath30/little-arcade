import * as THREE from 'three';
import {
  advance, basinWeights, boatRoute, clamp, cloudPosition, initial, makeClimate, mix,
  route, routeOffset, smooth, sunLongitude, terrain,
} from './climate.mjs';

const stage = document.querySelector('#stage');
const canvas = document.querySelector('#world');
const range = document.querySelector('#range');
const adjust = document.querySelector('#adjust');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const markers = Object.fromEntries([...document.querySelectorAll('.marker')].map((button) => [button.dataset.tool, button]));
const $ = (id) => document.getElementById(id);

const tools = {
  sun: {
    description: 'Sweep sunlight across the mountains to melt snow, feed rivers, and wake spring flowers.',
    label: 'Sun position', start: 'West', end: 'East',
    read: (value) => `${Math.round(value * 100)}%`,
  },
  cloud: {
    description: 'Gather moisture over the sea. Move inland for rain, or climb to the summit to make snow.',
    label: 'Cloud position', start: 'Ocean', end: 'Summit',
    read: (value) => value < .3 ? 'Ocean' : value < .79 ? 'Valley' : 'Summit',
  },
  moon: {
    description: 'Move the moon to uncover sandbars at low tide or let boats cross the islands at high tide.',
    label: 'Moon position', start: 'Low tide', end: 'High tide',
    read: (value) => `${Math.round(value * 100)}%`,
  },
};

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setClearColor(0, 0);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-6, 6, 4, -4, .1, 100);
camera.position.set(0, 0, 19);
const globe = new THREE.Group();
globe.rotation.order = 'YXZ';
scene.add(globe);
scene.add(new THREE.HemisphereLight('#d5eeff', '#6c776c', 1.77));
const key = new THREE.DirectionalLight('#ffdfb0', 1.85);
const fill = new THREE.DirectionalLight('#6aa4f7', .72);
fill.position.set(3, -2, -1);
scene.add(key, fill);

const radius = 2.55;
const v = new THREE.Vector3();
const normal = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const pose = new THREE.Object3D();
const paint = new THREE.Color();
const palette = {
  deep: new THREE.Color('#106379'),
  sand: new THREE.Color('#e7c991'),
  grass: new THREE.Color('#789d58'),
  wet: new THREE.Color('#4a7752'),
  dry: new THREE.Color('#b98760'),
  rock: new THREE.Color('#8b8e88'),
  snow: new THREE.Color('#e4f3f2'),
};
const bounds = { width: 0, height: 0, scale: 0, centerX: 0, centerY: 0 };
let values = { ...initial };
let climate = makeClimate();
let selected = 'sun';
let longitude = -.06;
let latitude = .08;
let zoom = 1;
let boatPosition = 0;
let boatHeading = 1;

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = randomGenerator(117);

function surfacePoint(lon, lat, r, target = new THREE.Vector3()) {
  return target.set(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)).multiplyScalar(r);
}

const landGeometry = new THREE.IcosahedronGeometry(radius, 30);
const positions = landGeometry.attributes.position;
const colors = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 3), 3);
landGeometry.setAttribute('color', colors);
const samples = [];
for (let i = 0; i < positions.count; i++) {
  v.fromBufferAttribute(positions, i).normalize();
  const lon = Math.atan2(v.x, v.z);
  const lat = Math.asin(v.y);
  const height = terrain(lon, lat);
  const sharpness = Math.sin(lon * 48 + lat * 31) * Math.cos(lat * 39 - lon * 13);
  const [left, right, blend] = basinWeights(lon);
  const { distance, progress } = routeOffset(lon, lat);
  samples.push({
    height, lat, left, right, blend, sharpness,
    river: distance < .026 && progress > .13 && progress < .91,
  });
  v.multiplyScalar(radius + height);
  positions.setXYZ(i, v.x, v.y, v.z);
}
positions.needsUpdate = true;
landGeometry.computeBoundingSphere();
globe.add(new THREE.Mesh(landGeometry, new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 1,
})));

const water = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 80), new THREE.ShaderMaterial({
  uniforms: {
    clock: { value: 0 },
    light: { value: new THREE.Vector3() },
    tide: { value: .2 },
  },
  vertexShader: [
    'varying vec3 surface;',
    'varying vec3 direction;',
    'void main() {',
    'surface = normalize(position);',
    'direction = normalize(mat3(modelMatrix) * normal);',
    'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform float clock;',
    'uniform float tide;',
    'uniform vec3 light;',
    'varying vec3 surface;',
    'varying vec3 direction;',
    'void main() {',
    'vec3 p = normalize(surface);',
    'vec3 n = normalize(direction);',
    'float crest = sin(p.x * 37.0 + p.y * 18.0 + cos(p.z * 16.0) * 3.0 + clock * 0.8);',
    'float detail = sin(p.y * 87.0 + p.x * 16.0 + 3.0 * sin(p.z * 20.0) - clock * 1.0);',
    'float swirl = sin(p.x * 10.0 + p.y * 12.0 + 2.0 * cos(p.z * 11.0));',
    'float sheen = smoothstep(0.75, 1.0, crest * 0.66 + detail * 0.34);',
    'float glow = smoothstep(-0.7, 0.95, dot(n, light));',
    'vec3 col = mix(vec3(0.024, 0.115, 0.175), vec3(0.055, 0.28, 0.31), glow);',
    'col *= 0.93 + 0.085 * swirl + tide * 0.045;',
    'col += vec3(0.027, 0.067, 0.061) * sheen * (0.5 + glow);',
    'col += vec3(0.024, 0.105, 0.115) * pow(1.0 - max(0.0, n.z), 2.2);',
    'gl_FragColor = vec4(col, 1.0);',
    '#include <colorspace_fragment>',
    '}',
  ].join('\n'),
}));
globe.add(water);

const air = new THREE.Mesh(new THREE.SphereGeometry(radius + .13, 96, 60), new THREE.ShaderMaterial({
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 norm; void main(){norm = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}',
  fragmentShader: 'varying vec3 norm; void main(){float rim=pow(1.0-abs(normalize(norm).z),3.4);gl_FragColor=vec4(0.25,0.69,0.75,rim*0.65);}',
}));
globe.add(air);

const riverCourse = new THREE.CatmullRomCurve3(route.slice(1).map(([lon, lat]) =>
  new THREE.Vector3(lon, lat, 0)));
const riverPath = new THREE.CatmullRomCurve3(riverCourse.getPoints(90).map(({ x: lon, y: lat }) =>
  surfacePoint(lon, lat, radius + terrain(lon, lat) + .019)));

const riverBed = new THREE.Mesh(new THREE.TubeGeometry(riverPath, 100, .017, 5, false),
  new THREE.MeshStandardMaterial({ color: '#526b62', roughness: .85 }));
const riverMaterial = new THREE.MeshStandardMaterial({
  color: '#6cdacc', emissive: '#195b60', roughness: .25, transparent: true, opacity: .68,
});
const riverWater = new THREE.Mesh(new THREE.TubeGeometry(riverPath, 100, .020, 6, false), riverMaterial);
globe.add(riverBed, riverWater);
const streamGeometry = new THREE.BufferGeometry();
const streamPositions = new THREE.Float32BufferAttribute(new Float32Array(22 * 3), 3);
streamGeometry.setAttribute('position', streamPositions);
const stream = new THREE.Points(streamGeometry, new THREE.PointsMaterial({
  color: '#dcffec', size: .023, transparent: true, depthWrite: false,
}));
stream.frustumCulled = false;
globe.add(stream);

function createForest() {
  const count = 410;
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2, 5), new THREE.MeshStandardMaterial({
    flatShading: true, roughness: 1,
  }), count);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({
    flatShading: true, roughness: .65,
  }), count);
  trees.frustumCulled = false;
  flowers.frustumCulled = false;
  const plants = [];
  for (let i = 0; i < count; i++) {
    let lon, lat, height;
    do {
      lon = mix(-.97, .56, random());
      lat = mix(-.68, .66, random());
      height = terrain(lon, lat);
    } while (height < .055 || height > .31 || routeOffset(lon, lat).distance < .04);
    const size = mix(.024, .077, random());
    const [left, right, blend] = basinWeights(lon);
    plants.push({ lon, lat, height, size, left, right, blend, threshold: random() });
    trees.setColorAt(i, new THREE.Color(i % 4 === 0 ? '#71884d' : i % 3 === 0 ? '#425b3e' : '#52754a'));
    flowers.setColorAt(i, new THREE.Color(['#ffc77f', '#f0a48a', '#f1e0a2', '#fbc4d4'][i % 4]));
  }
  globe.add(trees, flowers);
  return { trees, flowers, plants };
}
const { trees, flowers, plants } = createForest();

const weather = new THREE.Group();
globe.add(weather);
const puffMaterial = new THREE.MeshStandardMaterial({
  color: '#ebf5ed', flatShading: true, roughness: 1,
});
const puffGeometry = new THREE.IcosahedronGeometry(1, 2);
const puffs = new THREE.Group();
for (const [x, y, z, size] of [
  [-.26, .01, 0, .155], [-.12, .095, 0, .195], [.04, .105, -.015, .23],
  [.21, .05, 0, .178], [.30, .018, .005, .13], [.01, .0, .105, .18],
]) {
  const puff = new THREE.Mesh(puffGeometry, puffMaterial);
  puff.position.set(x, y, z);
  puff.scale.set(size * 1.3, size * .76, size);
  puffs.add(puff);
}
weather.add(puffs);
const dropsCount = 96;
const dropData = Array.from({ length: dropsCount }, () => [random(), random() - .5, random() - .5]);
const dropGeometry = new THREE.BufferGeometry();
const dropPositions = new THREE.Float32BufferAttribute(new Float32Array(dropsCount * 3), 3);
dropGeometry.setAttribute('position', dropPositions);
const dropMaterial = new THREE.PointsMaterial({ color: '#bdf4f3', transparent: true, size: .018 });
const rain = new THREE.Points(dropGeometry, dropMaterial);
rain.frustumCulled = false;
weather.add(rain);

const boat = new THREE.Group();
const hull = new THREE.Mesh(new THREE.BoxGeometry(.078, .034, .15), new THREE.MeshStandardMaterial({ color: '#aa684a' }));
const sail = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
  color: '#fff2cf', side: THREE.DoubleSide, flatShading: true,
}));
sail.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, .035, -.06, 0, .035, .069, 0, .16, .04,
], 3));
sail.geometry.computeVertexNormals();
hull.position.y = .015;
boat.add(hull, sail);
globe.add(boat);

const orbit = new THREE.Group();
scene.add(orbit);
for (const [width, height, angle, opacity] of [[3.46, .84, -.29, .30], [3.82, 1.23, -.29, .16]]) {
  const points = new THREE.EllipseCurve(0, 0, width, height, 0, Math.PI * 2, false, angle)
    .getPoints(160).map((point, i) => new THREE.Vector3(point.x, point.y, i <= 80 ? -3.2 : .9));
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#7dacae', transparent: true, opacity }));
  orbit.add(ring);
}

const stars = new THREE.Group();
scene.add(stars);
for (const [count, size, color] of [[275, .85, '#6e9293'], [85, 1.35, '#94aead'], [15, 1.85, '#bddcd5']]) {
  const coords = [];
  for (let i = 0; i < count; i++) coords.push(mix(-12, 12, random()), mix(-5, 5, random()), -9);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  stars.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, sizeAttenuation: false })));
}

function colorTerrain() {
  samples.forEach(({ height, lat, left, right, blend, sharpness, river }, i) => {
    const a = climate.regions[left];
    const b = climate.regions[right];
    const snow = mix(a.snow, b.snow, blend);
    const wet = mix(a.wet, b.wet, blend);
    const snowLine = mix(.49, .218, snow) - Math.max(0, lat - .3) * .12;
    paint.copy(palette.grass).lerp(palette.wet, smooth(.16, .74, wet));
    paint.lerp(palette.dry, (1 - smooth(.095, .49, wet)) * (1 - smooth(.12, .53, lat)) * .80);
    paint.lerp(palette.rock, smooth(.23, .48, height + sharpness * .049));
    paint.lerp(palette.snow, smooth(snowLine - .030, snowLine + .055, height + sharpness * .038));
    paint.lerp(palette.sand, 1 - smooth(.02, .091, height));
    paint.lerp(palette.deep, 1 - smooth(-.018, .009, height));
    if (river && height < .30) paint.multiplyScalar(.89);
    paint.multiplyScalar(1 + sharpness * .075);
    colors.setXYZ(i, paint.r, paint.g, paint.b);
  });
  colors.needsUpdate = true;
  plants.forEach(({ lon, lat, height, size, left, right, blend, threshold }, i) => {
    const a = climate.regions[left];
    const b = climate.regions[right];
    const snow = mix(a.snow, b.snow, blend);
    const bloom = mix(a.bloom, b.bloom, blend);
    const cover = smooth(.23, .38, height + snow * .12);
    surfacePoint(lon, lat, 1, normal);
    pose.quaternion.setFromUnitVectors(up, normal);
    const growth = size * (1 - cover) * (.63 + mix(a.wet, b.wet, blend) * .53);
    pose.position.copy(normal).multiplyScalar(radius + height + growth * 1.25);
    pose.scale.set(growth * .62, growth * 1.13, growth * .62);
    pose.updateMatrix();
    trees.setMatrixAt(i, pose.matrix);
    const petal = .038 * smooth(threshold - .22, threshold + .16, bloom * 1.35) * (1 - cover);
    pose.position.copy(normal).multiplyScalar(radius + height + .018);
    pose.scale.set(petal, petal * .6, petal);
    pose.updateMatrix();
    flowers.setMatrixAt(i, pose.matrix);
  });
  trees.instanceMatrix.needsUpdate = true;
  flowers.instanceMatrix.needsUpdate = true;
  $('snow').textContent = `${Math.round(climate.regions.slice(1, 5).reduce((sum, item) => sum + item.snow, 0) * 25)}%`;
  $('flow').textContent = climate.flow < .29 ? 'Low' : climate.flow < .58 ? 'Steady' : 'Strong';
  $('tide').textContent = `${climate.tide < .35 ? 'Low' : climate.tide < .69 ? 'Mid' : 'High'} · ${Math.round(climate.tide * 100)}%`;
}

function select(tool) {
  selected = tool;
  const entry = tools[tool];
  for (const button of document.querySelectorAll('[data-tool]')) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    if (button.classList.contains('tool')) button.setAttribute('aria-pressed', String(active));
  }
  adjust.className = `adjust ${tool}`;
  $('description').textContent = entry.description;
  $('range-label').textContent = entry.label.toUpperCase();
  $('range-start').textContent = entry.start;
  $('range-end').textContent = entry.end;
  updateInput();
}

function updateInput() {
  const percent = Math.round(values[selected] * 100);
  const label = tools[selected].read(values[selected]);
  range.value = percent;
  range.style.setProperty('--fill', `${percent}%`);
  range.setAttribute('aria-valuetext', label);
  $('range-value').textContent = label;
}

function setValue(tool, value) {
  values[tool] = clamp(value);
  if (tool === selected) updateInput();
}

document.querySelectorAll('.tool').forEach((button) => {
  button.addEventListener('click', () => select(button.dataset.tool));
});
range.addEventListener('input', () => setValue(selected, Number(range.value) / 100));
for (const [id, marker] of Object.entries(markers)) {
  let drag;
  marker.addEventListener('click', () => select(id));
  marker.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    select(id);
    drag = { x: event.clientX, current: values[id] };
    marker.setPointerCapture(event.pointerId);
  });
  marker.addEventListener('pointermove', (event) => {
    if (drag) setValue(id, drag.current + (event.clientX - drag.x) / Math.min(420, bounds.width * .70));
  });
  marker.addEventListener('lostpointercapture', () => { drag = undefined; });
  marker.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    select(id);
    setValue(id, values[id] + (event.key === 'ArrowRight' ? .04 : -.04));
  });
}

let orbitDrag;
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  orbitDrag = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointermove', (event) => {
  if (!orbitDrag) return;
  longitude += (event.clientX - orbitDrag.x) * .008;
  latitude = clamp(latitude + (event.clientY - orbitDrag.y) * .007, -1.1, 1.1);
  orbitDrag = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('lostpointercapture', () => { orbitDrag = undefined; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoom = clamp(zoom - event.deltaY * .001, .69, 1.62);
}, { passive: false });

function resetCamera() {
  longitude = -.06;
  latitude = .08;
  zoom = 1;
}
$('center').addEventListener('click', resetCamera);
$('reset-world').addEventListener('click', () => {
  resetCamera();
  values = { ...initial };
  climate = makeClimate();
  boatPosition = 0;
  boatHeading = 1;
  select('sun');
  colorTerrain();
});

function layout() {
  bounds.width = stage.clientWidth;
  bounds.height = stage.clientHeight;
  const narrow = bounds.width < 650;
  bounds.scale = Math.min(bounds.height / (narrow ? 8.9 : 7.4), bounds.width / (narrow ? 6.4 : 8.9));
  bounds.centerX = bounds.width * (narrow ? .52 : .60);
  bounds.centerY = bounds.height * (narrow ? .63 : .56);
  const halfWidth = bounds.width / bounds.scale / 2;
  const halfHeight = bounds.height / bounds.scale / 2;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  globe.position.set((bounds.centerX - bounds.width / 2) / bounds.scale,
    (bounds.height / 2 - bounds.centerY) / bounds.scale, 0);
  orbit.position.copy(globe.position);
  renderer.setSize(bounds.width, bounds.height, false);
}
new ResizeObserver(layout).observe(stage);
layout();

function placeMarker(marker, x, y) {
  const margin = marker.offsetWidth / 2 + 10;
  marker.style.left = `${clamp(x, margin, bounds.width - margin)}px`;
  marker.style.top = `${clamp(y, 26, bounds.height - 49)}px`;
  marker.classList.add('ready');
}

function animateWeather(time, dt) {
  const { lon, lat } = cloudPosition(values.cloud);
  const height = Math.max(.01, terrain(lon, lat));
  surfacePoint(lon, lat, 1, normal);
  weather.quaternion.setFromUnitVectors(up, normal);
  weather.position.copy(normal).multiplyScalar(radius + height + .41 + Math.sin(time * 2) * .027);
  puffs.scale.setScalar(1 + climate.precipitation * .28);
  puffMaterial.color.set(climate.precipitation > .5 ? '#b8d4d2' : '#e3f3ed');
  dropMaterial.size = climate.isSnowing ? .030 : .016;
  dropMaterial.opacity = clamp(climate.precipitation * .92);
  for (let i = 0; i < dropsCount; i++) {
    const [phase, x, z] = dropData[i];
    const fall = (time * (climate.isSnowing ? .69 : 2.9) + phase) % 1;
    dropPositions.setXYZ(i, x * .61 + Math.sin(phase * 24 + time) * fall * .075, -.04 - fall * .56, z * .36);
  }
  dropPositions.needsUpdate = true;

  const level = mix(-.031, .085, climate.tide);
  water.scale.setScalar((radius + level) / radius);
  water.material.uniforms.tide.value = climate.tide;
  water.material.uniforms.clock.value = time;
  const sun = sunLongitude(values.sun);
  key.position.set(Math.sin(sun) * 4 - .8, 3.3, 3.3 + Math.cos(sun) * 3.2);
  water.material.uniforms.light.value.copy(key.position).normalize();
  riverMaterial.opacity = .18 + climate.flow * .82;
  stream.material.opacity = climate.flow * .8;
  for (let i = 0; i < streamPositions.count; i++) {
    const t = (i / streamPositions.count + time * (.04 + climate.flow * .11)) % 1;
    riverPath.getPointAt(t, v);
    v.multiplyScalar(1.009);
    streamPositions.setXYZ(i, v.x, v.y, v.z);
  }
  streamPositions.needsUpdate = true;

  const passOpen = climate.tide > .72;
  if (passOpen && boatPosition >= 1) boatHeading = -1;
  if (passOpen && boatPosition <= 0) boatHeading = 1;
  if (passOpen) {
    boatPosition = clamp(boatPosition + dt * .10 * boatHeading);
  }
  const [boatLon, boatLat] = boatRoute(boatPosition);
  surfacePoint(boatLon, boatLat, 1, normal);
  const hullLevel = Math.max(level, terrain(boatLon, boatLat));
  boat.position.copy(normal).multiplyScalar(radius + hullLevel + .018 + Math.sin(time * 3) * .007);
  boat.quaternion.setFromUnitVectors(up, normal);
  boat.rotateY(boatHeading > 0 ? -Math.PI / 2 : Math.PI / 2);
}

select('sun');
colorTerrain();
const worldPoint = new THREE.Vector3();
function positionMarkers() {
  const span = bounds.scale * zoom;
  const narrow = bounds.width < 650;
  const sunAngle = values.sun * Math.PI * 2 + (narrow ? -2.55 : .60);
  placeMarker(markers.sun, bounds.centerX + span * (Math.cos(sunAngle) * (narrow ? 1.15 : 2.85) + (narrow ? 1.56 : 0)),
    bounds.centerY - span * (2.44 + Math.sin(sunAngle) * .42));
  weather.getWorldPosition(worldPoint).project(camera);
  placeMarker(markers.cloud, (worldPoint.x + 1) * bounds.width / 2 - 26,
    (1 - worldPoint.y) * bounds.height / 2 - 26);
  const moonAngle = mix(.06, 1.39, values.moon);
  placeMarker(markers.moon, bounds.centerX + span * Math.cos(moonAngle) * 3.62,
    bounds.centerY + span * (Math.sin(moonAngle) * 2.66 + .32));
}

let previous = performance.now();
let time = 0;
let sinceColor = 0;
renderer.setAnimationLoop((now) => {
  const dt = clamp((now - previous) / 1000, 0, .045);
  previous = now;
  if (!reducedMotion) time += dt;
  sinceColor += dt;
  advance(climate, values, dt);
  if (sinceColor > .095) {
    colorTerrain();
    sinceColor = 0;
  }
  globe.rotation.set(latitude, longitude, -.075);
  globe.scale.setScalar(zoom);
  orbit.scale.setScalar(zoom);
  animateWeather(time, reducedMotion ? 0 : dt);
  renderer.render(scene, camera);
  positionMarkers();
});
