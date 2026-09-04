/* ============================================================
   Интерактивный глобус 🌍
   Three.js + текстуры NASA (Blue Marble / ночные огни)
   — реальный терминатор дня и ночи (положение Солнца по UTC)
   — процедурные облака, атмосферное свечение, звёздное небо
   — метки городов с местным временем, маршруты из Франкфурта
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------- Данные городов ---------- */

const HOME = 'Франкфурт';

const CITIES = [
  { name: 'Франкфурт',      country: 'Германия',        lat: 50.11,  lon: 8.68,   tz: 'Europe/Berlin',      popM: 0.8 },
  { name: 'Лондон',         country: 'Великобритания',  lat: 51.51,  lon: -0.13,  tz: 'Europe/London',      popM: 8.9 },
  { name: 'Париж',          country: 'Франция',         lat: 48.86,  lon: 2.35,   tz: 'Europe/Paris',       popM: 2.1 },
  { name: 'Стамбул',        country: 'Турция',          lat: 41.01,  lon: 28.98,  tz: 'Europe/Istanbul',    popM: 15.6 },
  { name: 'Москва',         country: 'Россия',          lat: 55.76,  lon: 37.62,  tz: 'Europe/Moscow',      popM: 13.1 },
  { name: 'Дубай',          country: 'ОАЭ',             lat: 25.20,  lon: 55.27,  tz: 'Asia/Dubai',         popM: 3.6 },
  { name: 'Дели',           country: 'Индия',           lat: 28.61,  lon: 77.21,  tz: 'Asia/Kolkata',       popM: 32.9 },
  { name: 'Сингапур',       country: 'Сингапур',        lat: 1.35,   lon: 103.82, tz: 'Asia/Singapore',     popM: 6.0 },
  { name: 'Пекин',          country: 'Китай',           lat: 39.90,  lon: 116.40, tz: 'Asia/Shanghai',      popM: 21.9 },
  { name: 'Токио',          country: 'Япония',          lat: 35.68,  lon: 139.69, tz: 'Asia/Tokyo',         popM: 13.9 },
  { name: 'Сидней',         country: 'Австралия',       lat: -33.87, lon: 151.21, tz: 'Australia/Sydney',   popM: 5.3 },
  { name: 'Кейптаун',       country: 'ЮАР',             lat: -33.92, lon: 18.42,  tz: 'Africa/Johannesburg',popM: 4.8 },
  { name: 'Рио-де-Жанейро', country: 'Бразилия',        lat: -22.91, lon: -43.17, tz: 'America/Sao_Paulo',  popM: 6.7 },
  { name: 'Нью-Йорк',       country: 'США',             lat: 40.71,  lon: -74.01, tz: 'America/New_York',   popM: 8.8 },
  { name: 'Лос-Анджелес',   country: 'США',             lat: 34.05,  lon: -118.24,tz: 'America/Los_Angeles',popM: 3.9 },
];

const HOME_CITY = CITIES[0];

const COLORS = {
  home: 0xffb347,   // янтарь — дом
  city: 0x7fd8ff,   // светло-циановый — города
  arcA: 0xffb347,   // начало дуги
  arcB: 0x5fb8ff,   // конец дуги
};

/* ---------- Утилиты ---------- */

const DEG = Math.PI / 180;

/** Широта/долгота → вектор на сфере (совместимо с UV SphereGeometry + равнопромежуточная текстура) */
function latLonToVec3(lat, lon, r) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Точка, над которой Солнце в зените, прямо сейчас (для реального терминатора) */
function subsolarPoint(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5; // юлианский день
  const n = jd - 2451545.0;                          // дней с J2000
  let L = (280.460 + 0.9856474 * n) % 360;
  if (L < 0) L += 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  let gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  if (gmst < 0) gmst += 24;
  let lon = ra / DEG - gmst * 15;
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lat: dec / DEG, lon };
}

const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function fmtPop(m) { return m.toFixed(1).replace('.', ',').replace(',0', '') + ' млн'; }

function localTime(tz) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date());
  } catch { return '—'; }
}

/* ---------- Процедурные текстуры (canvas) ---------- */

/** Псевдослучайный хеш решётки → [0,1) */
function latticeHash(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

/** Value-noise с периодом px по X (бесшовность по долготе) */
function tileableNoise(x, y, px, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const a = latticeHash(x0, yi, seed),     b = latticeHash(x1, yi, seed);
  const c = latticeHash(x0, yi + 1, seed), d = latticeHash(x1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, px, seed, octaves = 5) {
  let sum = 0, amp = 0.5, tot = 0, freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileableNoise(x * freq, y * freq, px * freq, seed + o * 101);
    tot += amp; amp *= 0.55; freq *= 2;
  }
  return sum / tot;
}

/** Карта облаков: белый цвет + альфа = покрытие. Бесшовно по долготе. */
function makeCloudTexture(w = 1024, h = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const BASE = 6; // базовая частота по X
  for (let j = 0; j < h; j++) {
    const v = j / h;
    const polar = Math.pow(Math.sin(Math.PI * v), 0.35); // приглушить у полюсов
    for (let i = 0; i < w; i++) {
      const u = i / w;
      const f = fbm(u * BASE, v * BASE * 0.55, BASE, 42);
      let cov = Math.min(1, Math.max(0, (f - 0.44) / 0.30));
      cov = cov * cov * (3 - 2 * cov) * polar;
      const alpha = Math.round(cov * 255 * 0.85);
      const k = (j * w + i) * 4;
      img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255;
      img.data[k + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Точка-маркер: ядро + мягкое свечение (белая — тонировка через материал) */
function makeDotTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.0,  'rgba(255,255,255,1)');
  g.addColorStop(0.14, 'rgba(255,255,255,1)');
  g.addColorStop(0.2,  'rgba(255,255,255,0.55)');
  g.addColorStop(0.5,  'rgba(255,255,255,0.12)');
  g.addColorStop(1.0,  'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Кольцо для пульсации */
function makeRingTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = size * 0.055;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

/** Свечение Солнца */
function makeSunTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.0, 'rgba(255,255,245,1)');
  g.addColorStop(0.08,'rgba(255,240,200,0.9)');
  g.addColorStop(0.25,'rgba(255,210,130,0.35)');
  g.addColorStop(1.0, 'rgba(255,190,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* ---------- Твины ---------- */

const tweens = [];
function addTween(dur, ease, onUpdate, onEnd) {
  tweens.push({ t0: performance.now(), dur, ease, onUpdate, onEnd });
}
function updateTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    let k = Math.min(1, (now - tw.t0) / tw.dur);
    tw.onUpdate(tw.ease(k));
    if (k === 1) { tweens.splice(i, 1); tw.onEnd && tw.onEnd(); }
  }
}

/* ---------- Инициализация сцены ---------- */

const app = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (e) {
  document.getElementById('fatal').hidden = false;
  document.getElementById('loading').classList.add('done');
  throw e;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.cursor = 'grab';
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 400);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.55;
controls.enablePan = false;
controls.minDistance = 1.35;
controls.maxDistance = 10;
controls.autoRotateSpeed = 0.4;
controls.enabled = false; // включим после интро

/* Стартовая позиция камеры — «над Атлантикой», интро приведёт к Европе */
const introFrom = latLonToVec3(16, -35, 7.6);
camera.position.copy(introFrom);
camera.lookAt(0, 0, 0);

/* ---------- Загрузка текстур ---------- */

const loadingEl = document.getElementById('loading');
const loaderFill = document.getElementById('loader-fill');
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, done, total) => {
  loaderFill.style.width = Math.round((done / total) * 100) + '%';
};

const texLoader = new THREE.TextureLoader(manager);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

function loadTex(url, aniso = true) {
  const t = texLoader.load(url);
  if (aniso) t.anisotropy = maxAniso;
  return t;
}

const dayTex   = loadTex('assets/earth-day.jpg');
const nightTex = loadTex('assets/earth-night.jpg');
const waterTex = loadTex('assets/earth-water.png', false);
const starTex  = loadTex('assets/night-sky.png');

starTex.mapping = THREE.EquirectangularReflectionMapping;
scene.background = starTex;

/* ---------- Солнце ---------- */

const sunDir = new THREE.Vector3(1, 0, 0);
function updateSun() {
  const ssp = subsolarPoint();
  sunDir.copy(latLonToVec3(ssp.lat, ssp.lon, 1)).normalize();
  sunSprite.position.copy(sunDir).multiplyScalar(120);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeSunTexture(), transparent: true, depthWrite: false, depthTest: true,
}));
sunSprite.scale.setScalar(22);
scene.add(sunSprite);
updateSun();

/* ---------- Земля ---------- */

const earthUniforms = {
  dayMap:   { value: dayTex },
  nightMap: { value: nightTex },
  waterMask:{ value: waterTex },
  sunDir:   { value: sunDir },
};

const earthMat = new THREE.ShaderMaterial({
  uniforms: earthUniforms,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vPosW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform sampler2D waterMask;
    uniform vec3 sunDir;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vec3 n = normalize(vNormalW);
      vec3 s = normalize(sunDir);
      float sunCos = dot(n, s);

      // плавный терминатор день/ночь
      float dayMix = smoothstep(-0.14, 0.12, sunCos);

      vec3 dayCol   = texture2D(dayMap, vUv).rgb;
      vec3 nightCol = texture2D(nightMap, vUv).rgb;

      // ночные огни городов: чуть ярче и теплее
      nightCol *= vec3(1.30, 1.05, 0.78) * 1.45;

      // дневная сторона: ambient + солнце
      float diff = clamp(sunCos, 0.0, 1.0);
      vec3 dayLit = dayCol * (0.16 + 1.08 * pow(diff, 0.8));

      // солнечный блик на океанах
      float water = texture2D(waterMask, vUv).r;
      vec3 viewDir = normalize(cameraPosition - vPosW);
      vec3 h = normalize(viewDir + s);
      float spec = pow(clamp(dot(n, h), 0.0, 1.0), 48.0) * water * diff;
      dayLit += spec * vec3(1.0, 0.85, 0.6) * 0.6;

      vec3 color = mix(nightCol, dayLit, dayMix);

      // тёплая полоса сумерек вдоль терминатора
      float twi = exp(-pow(sunCos / 0.09, 2.0));
      color += vec3(0.95, 0.35, 0.12) * twi * 0.16;

      // голубая дымка у лимба (внутренняя атмосфера)
      float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 2.6);
      color += vec3(0.25, 0.5, 1.0) * fres * (0.10 + 0.5 * dayMix);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), earthMat);
earth.renderOrder = 0;
scene.add(earth);

/* ---------- Облака ---------- */

const cloudUniforms = {
  map: { value: makeCloudTexture() },
  sunDir: { value: sunDir },
};

const cloudsMat = new THREE.ShaderMaterial({
  uniforms: cloudUniforms,
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vNormalW;
    void main() {
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D map;
    uniform vec3 sunDir;
    varying vec2 vUv;
    varying vec3 vNormalW;
    void main() {
      vec3 n = normalize(vNormalW);
      float sunCos = dot(n, normalize(sunDir));
      float lit = clamp(sunCos, 0.0, 1.0);
      float dayMix = smoothstep(-0.12, 0.12, sunCos);

      float cover = texture2D(map, vUv).a;
      float alpha = cover * (0.14 + 0.6 * dayMix);

      vec3 col = vec3(0.62, 0.70, 0.80) * (0.22 + 1.05 * pow(lit, 0.9));
      // розоватый край облаков у терминатора
      col += vec3(0.5, 0.22, 0.08) * exp(-pow(sunCos / 0.1, 2.0)) * 0.5;

      gl_FragColor = vec4(col, alpha);
    }
  `,
});

const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.018, 120, 90), cloudsMat);
clouds.renderOrder = 1;
scene.add(clouds);

/* ---------- Атмосфера (внешнее свечение) ---------- */

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.16, 96, 64),
  new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir } },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec3 vNormalV;
      varying vec3 vNormalW;
      void main() {
        vNormalV = normalize(normalMatrix * normal);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir;
      varying vec3 vNormalV;
      varying vec3 vNormalW;
      void main() {
        float intensity = pow(clamp(0.62 - dot(vNormalV, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 5.0);
        float sunlit = 0.3 + 0.7 * smoothstep(-0.4, 0.4, dot(normalize(vNormalW), normalize(sunDir)));
        vec3 col = mix(vec3(0.12, 0.3, 0.85), vec3(0.35, 0.6, 1.0), intensity);
        gl_FragColor = vec4(col, 1.0) * intensity * sunlit * 1.35;
      }
    `,
  })
);
atmosphere.renderOrder = 4;
scene.add(atmosphere);

/* ---------- Маркеры городов + HTML-метки ---------- */

const dotTexture = makeDotTexture();
const ringTexture = makeRingTexture();

const labelsEl = document.getElementById('labels');
const markerGroups = CITIES.map((city, i) => {
  const isHome = city.name === HOME;
  const pos = latLonToVec3(city.lat, city.lon, 1.03);

  const dot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTexture, color: isHome ? COLORS.home : COLORS.city,
    transparent: true, depthWrite: false, depthTest: true,
  }));
  dot.scale.setScalar(isHome ? 0.06 : 0.048);
  dot.position.copy(pos);
  dot.renderOrder = 3;
  dot.userData.cityIndex = i;
  scene.add(dot);

  const ring = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ringTexture, color: isHome ? COLORS.home : COLORS.city,
    transparent: true, depthWrite: false, depthTest: true, opacity: 0,
  }));
  ring.position.copy(pos);
  ring.renderOrder = 3;
  scene.add(ring);

  const label = document.createElement('div');
  label.className = 'city-label' + (isHome ? ' home' : '');
  label.textContent = city.name;
  labelsEl.appendChild(label);

  return { city, isHome, pos, dot, ring, label, ringOffset: i * 0.37 };
});

/* ---------- Маршруты (дуги) из дома ---------- */

function greatCirclePoints(a, b, segments = 129) {
  const start = a.clone().normalize();
  const end = b.clone().normalize();
  const omega = start.angleTo(end);
  const sinO = Math.sin(omega);
  const alt = 0.05 + 0.24 * (omega / Math.PI);
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const v = (omega === 0)
      ? start.clone()
      : start.clone().multiplyScalar(Math.sin((1 - t) * omega) / sinO)
          .add(end.clone().multiplyScalar(Math.sin(t * omega) / sinO));
    v.normalize().multiplyScalar(1.005 + alt * Math.sin(Math.PI * t));
    pts.push(v);
  }
  return pts;
}

const arcsGroup = new THREE.Group();
scene.add(arcsGroup);

const arcMats = [];
const homePos = latLonToVec3(HOME_CITY.lat, HOME_CITY.lon, 1);
markerGroups.forEach(({ city, isHome, pos }) => {
  if (isHome) return;
  const pts = greatCirclePoints(homePos, pos);
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 128, 0.0024, 6);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:   { value: 0 },
      uOffset: { value: Math.random() },
      uSpeed:  { value: 0.10 + Math.random() * 0.08 },
      uColorA: { value: new THREE.Color(COLORS.arcA) },
      uColorB: { value: new THREE.Color(COLORS.arcB) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uOffset;
      uniform float uSpeed;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      void main() {
        float t = vUv.x;
        float head = fract(uTime * uSpeed + uOffset);
        float d = fract(head - t);           // «хвост кометы» за головой импульса
        float pulse = exp(-d * 16.0);
        float ends = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.95, t);
        float alpha = (0.18 + pulse * 1.0) * ends;
        vec3 col = mix(uColorA, uColorB, t);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  arcsGroup.add(mesh);
  arcMats.push(mat);
});

/* ---------- Полёт камеры к городу ---------- */

let flying = false;
function flyToDir(targetDir, dist, dur = 1500, onEnd) {
  const startPos = camera.position.clone();
  const startDist = startPos.length();
  const qa = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), startPos.normalize());
  const qb = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), targetDir.clone().normalize());
  flying = true;
  controls.enabled = false;
  controls.autoRotate = false;
  addTween(dur, easeInOutCubic, k => {
    const q = qa.clone().slerp(qb, k);
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    camera.position.copy(dir.multiplyScalar(startDist + (dist - startDist) * k));
    camera.lookAt(0, 0, 0);
  }, () => {
    flying = false;
    controls.enabled = true;
    onEnd && onEnd();
  });
}

function flyToCity(city) {
  const dir = latLonToVec3(city.lat, city.lon, 1).normalize();
  const dist = THREE.MathUtils.clamp(camera.position.length(), 2.0, 2.6);
  flyToDir(dir, dist, 1500, () => { scheduleAutoRotate(); });
}

/* ---------- Автовращение с паузой при взаимодействии ---------- */

const tgRotate = document.getElementById('tg-rotate');
let idleTimer = null;

function scheduleAutoRotate() {
  clearTimeout(idleTimer);
  controls.autoRotate = false;
  idleTimer = setTimeout(() => { controls.autoRotate = tgRotate.checked; }, 5000);
}

controls.addEventListener('start', () => {
  clearTimeout(idleTimer);
  controls.autoRotate = false;
});
controls.addEventListener('end', scheduleAutoRotate);

tgRotate.addEventListener('change', () => {
  clearTimeout(idleTimer);
  controls.autoRotate = tgRotate.checked;
});

/* ---------- Переключатели ---------- */

const tgClouds = document.getElementById('tg-clouds');
const tgArcs = document.getElementById('tg-arcs');
const tgLabels = document.getElementById('tg-labels');

function applyToggles() {
  clouds.visible = tgClouds.checked;
  arcsGroup.visible = tgArcs.checked;
  const showLabels = tgLabels.checked;
  markerGroups.forEach(m => { m.dot.visible = showLabels; m.ring.visible = showLabels; });
  labelsEl.style.display = showLabels ? '' : 'none';
}
[tgClouds, tgArcs, tgLabels].forEach(t => t.addEventListener('change', applyToggles));
applyToggles();

/* ---------- Наведение и клики по маркерам ---------- */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
let hovered = null;
let downX = 0, downY = 0;

renderer.domElement.addEventListener('pointermove', e => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
renderer.domElement.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
renderer.domElement.addEventListener('pointerup', e => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // это было вращение
  if (hovered !== null) flyToCity(CITIES[hovered]);
});

const tooltip = document.getElementById('tooltip');
const ttName = document.getElementById('tt-name');
const ttCountry = document.getElementById('tt-country');
const ttTime = document.getElementById('tt-time');
const ttPop = document.getElementById('tt-pop');

function setHovered(idx, screenX, screenY) {
  if (idx === hovered && idx !== null) {
    // просто двигаем карточку
    tooltip.style.left = screenX + 'px';
    tooltip.style.top = screenY + 'px';
    return;
  }
  if (idx === null) {
    hovered = null;
    tooltip.classList.remove('show');
    renderer.domElement.style.cursor = 'grab';
    return;
  }
  hovered = idx;
  const c = CITIES[idx];
  ttName.textContent = c.name;
  ttCountry.textContent = c.country;
  ttTime.textContent = localTime(c.tz);
  ttPop.textContent = 'Население: ' + fmtPop(c.popM);
  tooltip.style.left = screenX + 'px';
  tooltip.style.top = screenY + 'px';
  tooltip.classList.add('show');
  renderer.domElement.style.cursor = 'pointer';
}

/* ---------- Метки: проекция на экран каждый кадр ---------- */

const tmpVec = new THREE.Vector3();
const camDir = new THREE.Vector3();

function updateLabels() {
  if (!tgLabels.checked) return;
  camera.getWorldPosition(tmpVec);
  const camDist = tmpVec.length();
  camDir.copy(tmpVec).normalize();
  const horizon = 1 / camDist; // скалярно: видно то, что выше горизонта

  markerGroups.forEach(m => {
    m.dot.getWorldPosition(tmpVec);
    const nDot = tmpVec.x * camDir.x + tmpVec.y * camDir.y + tmpVec.z * camDir.z; // ~cos угла
    const facing = nDot / tmpVec.length();
    const px = tmpVec.clone().project(camera);
    const x = (px.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-px.y * 0.5 + 0.5) * window.innerHeight;
    const fade = THREE.MathUtils.smoothstep(facing, horizon, horizon + 0.18);
    const visible = fade > 0.02 && px.z < 1;
    m.label.style.transform = `translate(-50%, calc(-100% - 10px)) translate(${x}px, ${y}px)`;
    m.label.style.opacity = visible ? fade.toFixed(2) : '0';
  });
}

/* ---------- Размер окна ---------- */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- Цикл анимации (единственный) ---------- */

const clock = new THREE.Clock();
let sunRefreshAt = 0;
let tooltipRefreshAt = 0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const t = clock.getElapsedTime();

  updateTweens(now);
  controls.update();

  // Солнце: пересчитывать раз в 30 с (реальное время)
  if (now > sunRefreshAt) { updateSun(); sunRefreshAt = now + 30000; }

  // вращение облаков (независимый дрейф)
  clouds.rotation.y = t * 0.0045;

  // пульсация маркеров
  markerGroups.forEach(m => {
    const p = (t * 0.35 + m.ringOffset) % 1;
    m.ring.scale.setScalar(0.02 + 0.065 * p);
    m.ring.material.opacity = (1 - p) * 0.55 * (m.dot.visible ? 1 : 0);
    if (hovered !== null && CITIES[hovered] === m.city) {
      m.dot.scale.setScalar(m.isHome ? 0.078 : 0.064);
    } else {
      m.dot.scale.setScalar(m.isHome ? 0.06 : 0.048);
    }
  });

  // дуги: время
  arcMats.forEach(m => { m.uniforms.uTime.value = t; });

  // ховер по спрайтам (лучи пускаем раз в кадр)
  if (!flying) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markerGroups.filter(m => m.dot.visible).map(m => m.dot), false);
    if (hits.length) {
      const idx = hits[0].object.userData.cityIndex;
      const proj = markerGroups[idx].pos.clone().project(camera);
      const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
      setHovered(idx, sx, sy);
      if (now > tooltipRefreshAt) {
        ttTime.textContent = localTime(CITIES[idx].tz);
        tooltipRefreshAt = now + 15000;
      }
    } else {
      setHovered(null, 0, 0);
    }
  } else {
    setHovered(null, 0, 0);
  }

  updateLabels();
  renderer.render(scene, camera);
}

/* ---------- Интро после загрузки ---------- */

animate(); // единственный запуск цикла — экран загрузки всё равно сверху

manager.onLoad = () => {
  loaderFill.style.width = '100%';
  setTimeout(() => {
    loadingEl.classList.add('done');
    // плавный подлёт: Атлантика → Европа (Франкфурт)
    const targetDir = latLonToVec3(HOME_CITY.lat, HOME_CITY.lon, 1).normalize();
    flyToDir(targetDir, 3.1, 2600, () => {
      controls.enabled = true;
      controls.autoRotate = tgRotate.checked;
    });
  }, 350);
};
