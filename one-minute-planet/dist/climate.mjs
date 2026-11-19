export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (a, b, amount) => a + (b - a) * amount;
export const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const route = [
  [-.31, .59], [-.31, .44], [-.23, .30], [-.25, .16], [-.12, .02],
  [.045, -.1], [.19, -.12], [.26, -.245], [.44, -.35], [.62, -.43],
];
export const basins = [-1.05, -.68, -.33, 0, .33, .68, 1.05, Math.PI];
export const initial = { sun: .36, cloud: .17, moon: .35 };

export function sunLongitude(value) {
  return (value - .5) * Math.PI * 2;
}

export function cloudPosition(value) {
  return { lon: mix(-1.14, -.32, value), lat: mix(-.08, .67, value) };
}

export function makeClimate() {
  return {
    regions: basins.map((_, i) => ({
      snow: .69 + .22 * Math.cos(i + 1),
      wet: .25 + .10 * Math.sin(i + 1),
      bloom: .12,
    })),
    flow: .27,
    tide: .21,
    precipitation: 0,
    isSnowing: false,
  };
}

export function advance(climate, values, dt) {
  const sun = sunLongitude(values.sun);
  const cloud = cloudPosition(values.cloud);
  const rain = smooth(.19, .51, values.cloud);
  const cold = smooth(.73, .91, values.cloud);
  let runoff = 0;
  basins.forEach((lon, i) => {
    const region = climate.regions[i];
    const warmth = smooth(.34, .95, Math.cos(lon - sun));
    const showers = rain * Math.exp(-((lon - cloud.lon) ** 2) / .19);
    const melt = warmth * region.snow * (.065 + (1 - cold) * .038);
    region.snow = clamp(region.snow + (showers * cold * .22 + (1 - warmth) * .009 - melt) * dt);
    region.wet = clamp(region.wet + (showers * (1 - cold) * .20 + melt * 1.5 - region.wet * .047) * dt);
    const growing = warmth * smooth(.14, .53, region.wet) * (1 - region.snow * .75);
    region.bloom = mix(region.bloom, growing, 1 - Math.exp(-dt * .43));
    runoff += melt + showers * (1 - cold) * .13;
  });
  climate.flow = mix(climate.flow, clamp(.13 + runoff * 1.67), 1 - Math.exp(-dt * 1.25));
  climate.tide = mix(climate.tide, Math.sin(values.moon * Math.PI / 2) ** 2, 1 - Math.exp(-dt * 1.75));
  climate.precipitation = rain;
  climate.isSnowing = cold > .55;
}

export function routeOffset(lon, lat) {
  let distance = Infinity;
  let progress = 0;
  for (let i = 1; i < route.length; i++) {
    const [x, y] = route[i - 1];
    const [endX, endY] = route[i];
    const dx = endX - x;
    const dy = endY - y;
    const t = clamp(((lon - x) * dx + (lat - y) * dy) / (dx * dx + dy * dy));
    const d = (lon - x - dx * t) ** 2 + (lat - y - dy * t) ** 2;
    if (d < distance) {
      distance = d;
      progress = (i - 1 + t) / (route.length - 1);
    }
  }
  return { distance: Math.sqrt(distance), progress };
}

export function boatRoute(t) {
  return [mix(1.195, .66, t), mix(-.57, -.44, t) + Math.sin(t * Math.PI) * .045];
}

function island(lon, lat, x, y, width, height, tilt) {
  const u = (lon - x - (lat - y) * tilt) / width;
  return Math.exp(-2.3 * (u * u + ((lat - y) / height) ** 2));
}

export function terrain(lon, lat) {
  const noise = Math.sin(lon * 13 + lat * 9) * Math.cos(lat * 19 - lon * 8);
  const grain = Math.sin(lon * 43 + lat * 17) * Math.sin(lat * 39 - lon * 27);
  const body = Math.max(
    island(lon, lat, -.20, .25, .99, 1.22, -.20) * .36,
    island(lon, lat, .01, -.48, .87, .66, .34) * .24,
    island(lon, lat, .79, -.44, .31, .32, -.37) * .18,
    island(lon, lat, 1.075, -.29, .25, .33, .44) * .19,
    island(lon, lat, 1.36, -.11, .29, .32, .50) * .23,
    island(lon, lat, 1.68, .22, .35, .43, -.35) * .27,
    island(lon, lat, -.97, -.51, .25, .42, .25) * .21,
    island(lon, lat, -2.35, .17, .78, .95, -.28) * .31,
    island(lon, lat, 2.57, -.46, .61, .64, .30) * .29,
    island(lon, lat, .88, 1.15, .68, .32, .15) * .20,
  );
  const peaks =
    island(lon, lat, -.33, .58, .31, .34, -.18) * .37 +
    island(lon, lat, -.13, .61, .19, .25, .25) * .22 +
    island(lon, lat, -.57, .45, .24, .21, .2) * .21 +
    island(lon, lat, -.47, .18, .22, .31, .5) * .14 +
    island(lon, lat, -2.35, .39, .35, .36, -.4) * .24;
  const { distance, progress } = routeOffset(lon, lat);
  const riverCut = Math.exp(-(distance ** 2) / .007) * Math.sin(Math.PI * progress) * .061;
  const bank = island(lon, lat, .88, -.43, .47, .15, 1.5) * .115;
  const raw = body + peaks + bank - .107 - riverCut + (.031 * noise + .013 * grain) * smooth(0, .23, body + peaks);
  const riverMouth = smooth(.65, .99, progress) * (1 - smooth(.015, .105, distance));
  const elevation = mix(raw, Math.min(raw, mix(.066, -.051, smooth(.65, 1, progress))), riverMouth);
  const passage = clamp((1.195 - lon) / (1.195 - .66));
  const [passLon, passLat] = boatRoute(passage);
  const nearPass = 1 - smooth(.037, .14, Math.hypot(lon - passLon, lat - passLat));
  const passHeight = mix(-.045, .019, Math.sin(Math.PI * passage));
  return mix(elevation, Math.min(elevation, passHeight), nearPass);
}

export function basinWeights(lon) {
  let left = 0;
  while (left < basins.length - 1 && lon > basins[left + 1]) left++;
  const right = (left + 1) % basins.length;
  if (lon < basins[0]) {
    return [basins.length - 1, 0, smooth(-Math.PI, basins[0], lon)];
  }
  return [left, right, smooth(basins[left], basins[right], lon)];
}
