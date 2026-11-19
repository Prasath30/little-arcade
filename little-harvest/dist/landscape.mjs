import * as THREE from 'three';

export const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
export const mix = (a, b, ratio) => a + (b - a) * ratio;
export const tile = 1.8;
export const homePlot = [-3.6, -1.8];
export const suggestedPlot = [-3.6, 1.8];
export const bridgeZ = -3.6;

function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const round = new THREE.IcosahedronGeometry(1, 2);
const lump = new THREE.IcosahedronGeometry(1, 1);
const box = new THREE.BoxGeometry();
const log = new THREE.CylinderGeometry(.75, 1, 1, 8);
const grassBlade = new THREE.BufferGeometry();
grassBlade.setAttribute('position', new THREE.Float32BufferAttribute([
  -.48, 0, 0, -.17, .04, 0, -.64, .72, .20,
  -.13, 0, 0, .24, 0, 0, .24, .98, .14,
  .25, 0, .05, .47, 0, .04, .68, .62, -.12,
], 3));
grassBlade.computeVertexNormals();
const transform = new THREE.Object3D();
const tone = new THREE.Color();
const materials = new Map();
const standard = (color) => {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .93 }));
  return materials.get(color);
};

export function part(parent, geometry, color, x, y, z, sx, sy, sz, shadow = true) {
  const mesh = new THREE.Mesh(geometry, typeof color === 'string' ? standard(color) : color);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

function texture() {
  const image = document.createElement('canvas');
  image.width = image.height = 256;
  const ctx = image.getContext('2d');
  const pixels = ctx.createImageData(256, 256);
  const random = rng(27);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const grain = 218 + Math.floor(random() * 38) + 7 * Math.sin(x * Math.PI / 16 + Math.cos(y * Math.PI / 32));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grain;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(image);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(36, 36);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function riverCenter(z) {
  return 3.25 + Math.sin(z * .205) * 1.67 + Math.sin(z * .071 + 1) * .61;
}

export function riverWidth(z) {
  return 1.45 + .2 * Math.cos(z * .34) + .12 * Math.sin(z * .81);
}

export function height(x, z) {
  const near = .13 * Math.sin(x * .43 + z * .19) + .15 * Math.cos(z * .32 - x * .09);
  const hill = (cx, cz, sx, sz, peak) => peak * Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2));
  const terrain = .25 + near + hill(-17, -11, 6, 9, 2.3) + hill(20, -14, 8, 8, 3.8)
    + hill(-12, -25, 13, 9, 6.4) + hill(8, -34, 12, 10, 9.5)
    + hill(-31, -33, 14, 11, 11.5) + hill(26, -39, 12, 12, 10)
    + hill(-43, -8, 13, 15, 9) + hill(32, 10, 12, 12, 8)
    + hill(-18, 16, 7, 5, 3.2) + hill(13, 13, 6, 8, 2.4);
  const bank = clamp((Math.abs(x - riverCenter(z)) - riverWidth(z) + .42) / 1.28, 0, 1);
  const blend = bank * bank * (3 - 2 * bank);
  return mix(-.49, terrain, blend);
}

function land(scene) {
  const geometry = new THREE.PlaneGeometry(140, 128, 282, 258);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -15);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const meadow = new THREE.Color('#809154');
  const young = new THREE.Color('#a6aa66');
  const moss = new THREE.Color('#506d3f');
  const silt = new THREE.Color('#a29264');
  const stone = new THREE.Color('#8e8a75');
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const y = height(x, z);
    position.setY(index, y);
    const d = Math.abs(x - riverCenter(z)) - riverWidth(z);
    const wave = Math.sin(x * .49 + z * .65 + .6 * Math.sin(z * .21)) * Math.cos(z * .42 - x * .31);
    const patch = .5 + .5 * Math.sin(x * .21 + z * .19 + 1.65 * Math.cos(z * .28));
    const rock = clamp((y - 4.2) / 6 + .15 * wave, 0, .72);
    tone.copy(meadow).lerp(young, patch * .55).lerp(moss, .17 + .14 * wave)
      .lerp(silt, clamp((.65 - d) * 1.4, 0, .92)).lerp(stone, rock)
      .multiplyScalar(.96 + wave * .10 + .037 * Math.sin(x * 12.7 + z * 16.4));
    tone.toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, map: texture(), roughness: 1,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

function creek(scene) {
  const points = [];
  const uvs = [];
  const faces = [];
  const steps = 320;
  for (let i = 0; i <= steps; i++) {
    const z = mix(-73, 43, i / steps);
    const width = riverWidth(z) + .11;
    const center = riverCenter(z);
    points.push(center - width, -.12, z, center + width, -.12, z);
    uvs.push(0, z, 1, z);
    if (i) {
      const offset = (i - 1) * 2;
      faces.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  const clock = { value: 0 };
  const water = new THREE.MeshStandardMaterial({ color: '#639e95', roughness: .27, metalness: .12 });
  water.onBeforeCompile = (shader) => {
    shader.uniforms.clock = clock;
    shader.vertexShader = 'varying vec2 flowUv;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>', '#include <uv_vertex>\nflowUv = uv;');
    shader.fragmentShader = 'varying vec2 flowUv; uniform float clock;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', [
        '#include <color_fragment>',
        'float u = flowUv.x;',
        'float z = flowUv.y;',
        'float current = sin(z * 3.7 - clock * 1.6 + cos(u * 23.0 + z * 1.7) * .7);',
        'float ripple = sin(u * 109.0 + z * 5.5 - clock * 2.4);',
        'float froth = smoothstep(.73,1.,current * .63 + .37 * ripple);',
        'float shallows = pow(abs(u * 2. - 1.), 2.0);',
        'diffuseColor.rgb *= .94 + .11 * sin(u * 7. + z * .48) + .10 * current;',
        'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.39,.52,.34), shallows * .64);',
        'diffuseColor.rgb += vec3(.13,.21,.16) * froth * (.45 + .8 * shallows);',
      ].join('\n'));
  };
  const mesh = new THREE.Mesh(geometry, water);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return clock;
}

function makeScenery(scene) {
  const random = rng(72);
  const leaves = [];
  const conifers = [];
  const trunks = [];
  const stones = [];
  const grasses = [];
  const flowers = [];
  const stem = new THREE.ConeGeometry(1, 1, 9);
  const woody = ['#72593b', '#806447', '#94815c', '#b29a73'];
  const canopies = ['#49683c', '#607d43', '#74964b', '#839b4a', '#a3a859', '#698446', '#7d9a5c'];
  const pines = ['#4d6544', '#577253', '#5e805e', '#718658', '#587452'];
  const cobbles = ['#9b9881', '#b4ab90', '#77816c', '#aea185', '#c4bca3'];
  function plantTree(x, z, size, conifer) {
    const y = height(x, z);
    const width = size * (.048 + random() * .023);
    trunks.push([x, y + size * .33, z, width, size * .69, width, woody[Math.floor(random() * woody.length)], -.05 + .10 * random()]);
    if (conifer) {
      const baseColor = Math.floor(random() * pines.length);
      for (let i = 0; i < 4; i++) {
        const scale = size * mix(.265, .105, i / 3);
        conifers.push([x, y + size * (.42 + i * .165), z, scale, size * .49, scale, pines[(baseColor + (i === 3 ? 1 : 0)) % pines.length], 0]);
      }
      return;
    }
    const tint = Math.floor(random() * canopies.length);
    const near = Math.abs(x) < 16 && z > -21;
    for (let i = 0; i < (near ? 21 : 10); i++) {
      const a = i * 2.399;
      const outer = i > 8;
      const s = size * (outer ? .081 + random() * .077 : .14 + random() * .092);
      const r = size * (outer ? .17 + .20 * random() : .055 + .18 * random());
      leaves.push([x + Math.cos(a) * r, y + size * mix(.57, .95, random()), z + Math.sin(a) * r,
        s * 1.25, s * .94, s * 1.13, canopies[(tint + i % 3) % canopies.length], a]);
    }
  }

  for (let i = 0; i < 670; i++) {
    const x = mix(-52, 52, random());
    const z = mix(-59, 24, random());
    const d = Math.abs(x - riverCenter(z));
    if ((Math.abs(x) < 11.5 && z > -9.6 && z < 11.5) || d < riverWidth(z) + .93) continue;
    const patch = Math.sin(x * .25 + z * .12) * Math.sin(z * .35 - x * .20);
    if (patch < -.22 && random() > .24) continue;
    plantTree(x, z, mix(1.4, 4.3, random()), z < -10 ? random() < .74 : random() < .28);
  }
  for (const [x, z, s, pine] of [[-7.7,-7.5,3.6,false],[-9.6,-4.7,3.9,false],[9.3,-6.8,3.1,false],
      [-9.8,4.3,4.1,false],[-11.1,6.1,3.3,false],[8.6,7.8,3.5,false],[-.05,-7.6,2.65,true],
      [-7.2,-11,4.1,true],[10.6,4.2,3.62,true],[7.8,10,2.8,false],[.42,7.7,2.43,false]]) {
    plantTree(x, z, s, pine);
  }

  for (let i = 0; i < 245; i++) {
    const z = mix(-25, 23, random());
    const edge = random() > .48 ? 1 : -1;
    const x = riverCenter(z) + edge * (riverWidth(z) + mix(-.08, 1.5, random()));
    const size = mix(.055, .34, random() ** 2);
    stones.push([x, height(x, z) + size * .29, z, size * 1.2, size * .70, size,
      cobbles[i % cobbles.length], random() * Math.PI]);
  }
  for (let i = 0; i < 87; i++) {
    const x = mix(-28, 27, random());
    const z = mix(-28, 17, random());
    if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
    const s = mix(.16, .95, random() ** 1.4);
    stones.push([x, height(x, z) + s * .13, z, s, s * .53, s * 1.32, cobbles[i % cobbles.length], random() * Math.PI]);
  }
  for (let i = 0; i < 5700; i++) {
    const x = mix(-25, 24, random());
    const z = mix(-28, 23, random());
    const y = height(x, z);
    if (y < -.03 || (Math.abs(x) < 9 && Math.abs(z) < 7 && random() > .48)) continue;
    const s = mix(.105, .43, random() ** 2);
    grasses.push([x, y, z, s * .42, s, s, canopies[i % canopies.length], random() * Math.PI]);
    if (i % 11 === 0 && z > -12 && Math.abs(x) < 15) {
      flowers.push([x, y + s * .92, z, .048, .038, .052, ['#f1ebbd', '#f4df9d', '#dfb9a7', '#d5cbdd'][i % 4], 0]);
    }
  }
  for (const [cx, cz, color, count] of [
    [-8.6, 5.4, '#eee0b3', 95], [-6.1, 5.8, '#ebce88', 69], [-7.9, -.2, '#e5d6bc', 51],
    [6.1, -2.1, '#f2deaa', 86], [-1.6, 6.9, '#d7bdce', 65], [8.6, 5.0, '#f1d9a5', 74],
  ]) {
    for (let i = 0; i < count; i++) {
      const a = random() * 6.28;
      const r = Math.sqrt(random()) * 1.24;
      const x = cx + Math.cos(a) * r * 1.40;
      const z = cz + Math.sin(a) * r * .79;
      const y = height(x, z);
      if (y < .05) continue;
      const h = mix(.13, .30, random());
      const s = mix(.037, .080, random());
      grasses.push([x, y, z, .078, h, 1, '#647f4d', a]);
      flowers.push([x, y + h * .95, z, s, s * .67, s, color, a]);
    }
  }
  const surface = new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true });
  const thin = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
  for (const [geo, points, casts, material] of [
    [log, trunks, true, surface], [round, leaves, true, surface], [stem, conifers, true, surface],
    [lump, stones, true, surface], [grassBlade, grasses, false, thin], [lump, flowers, false, surface],
  ]) {
    const mesh = new THREE.InstancedMesh(geo, material, points.length);
    for (let i = 0; i < points.length; i++) {
      const [x, y, z, sx, sy, sz, color, angle] = points[i];
      transform.position.set(x, y, z);
      transform.rotation.set(0, angle, 0);
      transform.scale.set(sx, sy, sz);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(i, tone.set(color));
    }
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function bridge(scene) {
  const group = new THREE.Group();
  const x = riverCenter(bridgeZ);
  const size = riverWidth(bridgeZ) + .75;
  group.position.set(x, .21, bridgeZ);
  const width = size * 2;
  for (let i = 0; i < 20; i++) {
    const ratio = (i + .5) / 20;
    const y = Math.sin(ratio * Math.PI) * .29;
    const board = part(group, box, i % 3 ? '#a07b55' : '#b68c61', mix(-size, size, ratio), y, 0, width / 20 - .018, .105, .92);
    board.rotation.z = Math.cos(ratio * Math.PI) * .22;
  }
  for (const z of [-.43, .43]) {
    for (const ratio of [0, .25, .50, .75, 1]) {
      const y = Math.sin(ratio * Math.PI) * .29;
      part(group, box, '#836340', mix(-size, size, ratio), y + .25, z, .11, .57, .12);
      if (ratio === 1) continue;
      const middle = ratio + .125;
      const rail = part(group, box, '#9b7851', mix(-size, size, middle), Math.sin(middle * Math.PI) * .29 + .43, z, width / 4 + .06, .082, .088);
      rail.rotation.z = Math.cos(middle * Math.PI) * .22;
    }
  }
  scene.add(group);
}

export function buildLandscape(scene) {
  scene.fog = new THREE.Fog('#dce8c9', 28, 77);
  const ground = land(scene);
  const waterClock = creek(scene);
  makeScenery(scene);
  bridge(scene);
  return { ground, waterClock };
}

function gable(color, z, width, shoulder, peak) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -width / 2, shoulder, z, width / 2, shoulder, z, 0, peak, z,
  ], 3));
  geometry.computeVertexNormals();
  const material = standard(color).clone();
  material.side = THREE.DoubleSide;
  const face = new THREE.Mesh(geometry, material);
  face.castShadow = face.receiveShadow = true;
  return face;
}

export function cottage(x, z, variant = 0, yard = false) {
  const group = new THREE.Group();
  const colors = ['#b86c4c', '#9e7655', '#ad654a', '#a97158'];
  const timber = '#79573c';
  const wall = '#e7cda0';
  const width = 1.64;
  const shoulder = 1.30;
  const peak = 2.04;
  const length = 1.66;
  group.position.set(x, height(x, z) - .05, z);
  group.rotation.y = variant % 2 ? -.19 : .10;

  part(group, box, '#a19b80', 0, .14, 0, 1.77, .26, 1.79);
  part(group, box, wall, 0, (shoulder + .17) / 2, 0, width, shoulder - .17, length);
  part(group, box, '#6d4c36', 0, .28, 0, 1.70, .10, 1.71);
  for (const side of [-1, 1]) {
    const faceZ = side * (length / 2 + .008);
    const faceX = side * (width / 2 + .014);
    group.add(gable(wall, faceZ, width, shoulder, peak));
    part(group, box, timber, 0, shoulder, faceZ, width + .04, .075, .064);
    part(group, box, timber, 0, 1.60, faceZ, .068, .61, .060);
    for (const corner of [-1, 1]) {
      part(group, box, timber, corner * (width / 2 - .025), .79, faceZ, .09, 1.05, .06);
    }
    part(group, box, timber, faceX, shoulder - .045, 0, .065, .075, length);
    part(group, box, timber, faceX, .74, 0, .058, .055, length);
    const window = part(group, box, '#604a36', faceX + side * .025, .90, -.15, .07, .48, .49);
    part(group, box, '#edbc6a', window.position.x + side * .035, .90, -.15, .032, .33, .32);
    part(group, box, timber, window.position.x + side * .055, .90, -.15, .025, .32, .031);
    part(group, box, timber, window.position.x + side * .055, .90, -.15, .025, .033, .33);
    part(group, box, timber, window.position.x, .66, -.15, .14, .05, .57);

    const roof = new THREE.Group();
    roof.position.set(side * .453, 1.67, 0);
    roof.rotation.z = -side * .699;
    part(roof, box, '#624d39', 0, -.016, 0, 1.19, .085, 2.05);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 10; col++) {
        const color = (row * 29 + col * 53 + variant * 17) % 13;
        const tileColor = color < 3 ? '#a95f43' : color < 5 ? '#c28660' : colors[variant % colors.length];
        const shingle = part(roof, box, tileColor, mix(-.5, .5, row / 6), .045 + color * .0015,
          -.89 + col * .197 + (row % 2 ? .026 : 0), .188, .066, .186, false);
        shingle.receiveShadow = true;
      }
    }
    for (const end of [-1, 1]) part(roof, box, '#9e714d', 0, 0, end * 1.035, 1.24, .13, .079);
    group.add(roof);
  }
  part(group, box, '#985c40', 0, 2.06, 0, .155, .13, 2.11);
  part(group, box, '#a79981', .47, 1.98, -.49, .30, .80, .30);
  part(group, box, '#a57c5e', .47, 2.38, -.49, .37, .12, .38);
  part(group, box, '#655642', .47, 2.445, -.49, .18, .026, .18);
  part(group, box, '#654a33', -.25, .58, .852, .47, .85, .054);
  for (let i = 0; i < 4; i++) part(group, box, i % 2 ? '#8b6646' : '#9a7450', -.412 + i * .107, .569, .885, .101, .72, .028);
  part(group, round, '#dfb475', -.132, .57, .911, .035, .035, .035);
  part(group, box, '#a19a7f', -.25, .173, .985, .59, .13, .28);
  part(group, box, timber, .39, .88, .852, .48, .49, .06);
  part(group, box, '#edbd6d', .39, .88, .893, .33, .33, .029);
  part(group, box, timber, .39, .88, .918, .031, .33, .028);
  part(group, box, timber, .39, .88, .918, .33, .031, .028);
  part(group, box, '#946b49', .39, .63, .94, .55, .12, .20);
  for (let i = 0; i < 7; i++) {
    part(group, round, ['#869052', '#b6a060', '#df9d77', '#daba6b'][i % 4],
      .17 + i * .072, .72 + i % 2 * .032, .98, .056, .055, .063, false);
  }
  if (yard) {
    for (let i = 0; i < 5; i++) {
      const zz = -.98 + i * .55;
      part(group, box, '#8d714e', -1.28, .28, zz, .105, .58, .104);
      if (i !== 4) for (const y of [.20, .39]) part(group, box, '#aa8a5f', -1.28, y, zz + .28, .066, .056, .55);
    }
    for (const [xx, zz] of [[1.14,.66], [1.12,1.04]]) {
      part(group, log, '#9d7754', xx, .26, zz, .15, .40, .15);
      for (const y of [.13, .37]) part(group, log, '#68604a', xx, y, zz, .161, .039, .161);
    }
  }
  return group;
}

const furrow = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
const stemGeometry = new THREE.CylinderGeometry(.45, 1, 1, 4);
const grainGeometry = new THREE.IcosahedronGeometry(1, 0);
const cropMaterial = new THREE.MeshStandardMaterial({ roughness: .84, flatShading: true });
const straw = new THREE.Color('#ccb357');
const wheat = new THREE.Color('#dbb45c');
const seedling = new THREE.Color('#799053');
const green = new THREE.Color('#a3a558');
const moistSoil = new THREE.Color('#785139');
const drySoil = new THREE.Color('#8d694a');

export function field(x, z, seed) {
  const group = new THREE.Group();
  group.position.set(x, height(x, z) + .017, z);
  const soil = standard('#8d694a').clone();
  const patch = new THREE.PlaneGeometry(1.72, 1.72, 7, 7);
  patch.rotateX(-Math.PI / 2);
  const vertices = patch.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, height(x + vertices.getX(i), z + vertices.getZ(i)) - group.position.y + .036);
  }
  patch.computeVertexNormals();
  const dirt = new THREE.Mesh(patch, soil);
  dirt.receiveShadow = true;
  group.add(dirt);
  const plants = [];
  const random = rng(seed);
  for (let i = 0; i < 6; i++) {
    const px = -.69 + i * .272;
    const groove = part(group, furrow, i % 2 ? '#9c734d' : '#977049', px, .033, 0, .126, .059, 1.61);
    groove.rotation.y = .009 * (i % 2);
    for (let j = 0; j < 7; j++) {
      const pz = -.70 + j * .23 + (random() - .5) * .12;
      const xx = px + (random() - .5) * .18;
      const base = height(x + xx, z + pz) - group.position.y + .068;
      plants.push([xx, base, pz, mix(.22, .62, random()), random() * 6.28, random()]);
    }
  }
  const stems = new THREE.InstancedMesh(stemGeometry, cropMaterial, plants.length);
  const heads = new THREE.InstancedMesh(grainGeometry, cropMaterial, plants.length);
  stems.castShadow = heads.castShadow = true;
  group.add(stems, heads);
  return { group, plants, stems, heads, soil };
}

export function growField(visual, progress, moisture, time) {
  const { plants, stems, heads, soil } = visual;
  soil.color.copy(drySoil).lerp(moistSoil, moisture);
  for (let i = 0; i < plants.length; i++) {
    const [x, y, z, size, phase, variation] = plants[i];
    const mature = clamp((progress - .32 + variation * .10) / .68, 0, 1);
    const tall = size * (.13 + progress * .87);
    const sway = Math.sin(time * 2 + phase) * .13 * progress;
    transform.position.set(x, y + tall / 2, z);
    transform.rotation.set(sway, phase, sway * .6);
    transform.scale.set(.023, tall, .023);
    transform.updateMatrix();
    stems.setMatrixAt(i, transform.matrix);
    stems.setColorAt(i, tone.copy(seedling).lerp(straw, mature));
    transform.position.set(x, y + tall, z + sway * tall * .49);
    const head = .025 + mature * .038;
    transform.scale.set(head, head * (1.05 + mature * .94), head * .7);
    transform.updateMatrix();
    heads.setMatrixAt(i, transform.matrix);
    heads.setColorAt(i, tone.copy(green).lerp(wheat, mature));
  }
  stems.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  stems.instanceColor.needsUpdate = heads.instanceColor.needsUpdate = true;
}

export function footpath(x, z, worn = false) {
  const size = worn ? 1.00 : 1.69;
  const geometry = new THREE.CircleGeometry(size / 2, 22);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const radius = i ? .94 + .1 * Math.sin(i * 2.26 + x) : 1;
    const xx = position.getX(i) * radius;
    const zz = position.getZ(i) * radius;
    position.setXYZ(i, xx, height(x + xx, z + zz) + .049, zz);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, standard(worn ? '#9c8c5c' : '#b39968'));
  mesh.position.set(x, 0, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function villager(index) {
  const body = new THREE.Group();
  const torso = new THREE.CapsuleGeometry(.138, .19, 3, 8);
  const skin = ['#c89873', '#9c6749', '#d7ad83', '#bb845e'][index % 4];
  const clothes = ['#ad654c', '#638576', '#a68b56', '#8a6c86', '#78965b'][index % 5];
  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * .073, .25, 0);
    part(leg, box, '#615945', 0, -.10, 0, .080, .184, .09);
    part(leg, round, '#64513b', 0, -.205, .031, .055, .048, .093);
    legs.push(leg);
    body.add(leg);
    const arm = new THREE.Group();
    arm.position.set(side * .145, .51, 0);
    part(arm, round, clothes, side * .018, -.080, 0, .056, .119, .058);
    part(arm, round, skin, side * .025, -.173, .014, .044, .045, .041);
    arms.push(arm);
    body.add(arm);
  }
  part(body, torso, clothes, 0, .43, 0, .97, 1, .75);
  part(body, round, skin, 0, .722, .013, .124, .14, .12);
  part(body, round, '#6a503b', 0, .799, -.015, .129, .068, .11);
  const hat = index % 3 === 0 ? '#c5a46f' : ['#77684d', '#92744d', '#7c7f62'][index % 3];
  part(body, log, hat, 0, .813, .01, .155, .033, .144);
  part(body, round, hat, 0, .847, .005, .104, .065, .102);
  for (const side of [-1, 1]) part(body, round, '#493b2e', side * .045, .738, .121, .010, .011, .009, false);
  const basket = new THREE.Group();
  basket.position.set(0, .32, .148);
  part(basket, log, '#a48254', 0, .02, 0, .105, .113, .086);
  part(basket, round, '#dbb458', 0, .092, 0, .091, .055, .071);
  body.add(basket);
  const bucket = new THREE.Group();
  bucket.position.set(.193, .291, .127);
  part(bucket, log, '#927b61', 0, 0, 0, .086, .113, .086);
  part(bucket, log, '#83b3ad', 0, .069, 0, .064, .016, .064);
  body.add(bucket);
  return { body, legs, arms, basket, bucket };
}

export function makeCloud() {
  const group = new THREE.Group();
  const pale = new THREE.MeshStandardMaterial({ color: '#f5f1df', roughness: 1 });
  for (const [x,y,z,s] of [[-.87,0,0,.67],[-.43,.35,.06,.77],[.20,.34,-.02,.81],[.74,.07,0,.61],[.17,-.10,.37,.64],[-.34,-.05,-.36,.61]]) {
    part(group, round, pale, x, y, z, s * 1.18, s * .76, s, false);
  }
  return { group, material: pale };
}
