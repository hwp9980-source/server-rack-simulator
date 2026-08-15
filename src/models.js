// 구성품 절차적 3D 모델링
import * as THREE from 'three';

export const U = 0.04445;          // 1U 높이 (m)
export const UNIT_W = 0.45;        // 섀시 폭 (m)
export const FACE_W = 0.4826;      // 19인치 전면 플레이트 폭 (m)
const GAP = 0.004;                 // 유닛 상하 여유

const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.roughness ?? 0.6}|${opts.metalness ?? 0.35}|${opts.emissive ?? 0}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.6,
      metalness: opts.metalness ?? 0.35,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissive ? 1.2 : 0,
    }));
  }
  return matCache.get(key);
}

const labelCache = new Map();
function nameLabel(text, accent) {
  const key = `${text}|${accent}`;
  if (!labelCache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 48;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#' + accent.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 10, cv.height);
    ctx.fillStyle = '#c9cfda';
    ctx.font = 'bold 26px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 22, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    labelCache.set(key, tex);
  }
  return labelCache.get(key);
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  return m;
}

// 전면 z 위치(플레이트 표면) 기준으로 디테일을 얹는다
function addFrontDetail(group, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  group.add(mesh);
}

/**
 * 유닛 타입 정의로부터 THREE.Group 생성.
 * 그룹 원점: 유닛 바닥 중앙, 전면이 +z.
 */
export function createUnitMesh(type) {
  const g = new THREE.Group();
  const h = type.u * U - GAP;
  const d = Math.max(type.depth / 1000, 0.02);
  const cy = h / 2;

  const chassisMat = mat(0x333841, { roughness: 0.55 });
  const faceMat = mat(0x272b32, { roughness: 0.5 });
  const accentMat = mat(type.accent, { roughness: 0.4 });

  // 섀시 본체 (전면 플레이트보다 뒤로) — 선반은 얇은 트레이(slab)로 별도 표현하므로 제외
  if (type.style !== 'blank' && type.style !== 'cable' && type.style !== 'shelf') {
    const body = box(UNIT_W, h, d, chassisMat);
    body.position.set(0, cy, -d / 2);
    g.add(body);
  }

  // 전면 플레이트 (랙 귀 포함 폭) — 선반은 위에 놓인 기기가 가려지지 않도록 짧은 앞턱만 표현
  const faceD = 0.012;
  const isShelf = type.style === 'shelf';
  const faceH = isShelf ? 0.011 : h;
  const faceY = isShelf ? 0.0055 : cy;
  const face = box(FACE_W, faceH, faceD, faceMat);
  face.position.set(0, faceY, faceD / 2);
  g.add(face);
  const faceZ = faceD + 0.001; // 디테일 표면 z

  // 스타일별 전면 디테일
  switch (type.style) {
    case 'server': addServerFront(g, type, h, cy, faceZ); break;
    case 'storage': addStorageFront(g, type, h, cy, faceZ); break;
    case 'switch': addSwitchFront(g, type, h, cy, faceZ); break;
    case 'patch': addPatchFront(g, type, h, cy, faceZ); break;
    case 'ups': addUpsFront(g, type, h, cy, faceZ); break;
    case 'pdu': addPduFront(g, type, h, cy, faceZ); break;
    case 'kvm': addKvmFront(g, type, h, cy, faceZ); break;
    case 'shelf': {
      const slab = box(UNIT_W, 0.008, d, chassisMat);
      slab.position.set(0, 0.008, -d / 2);
      g.add(slab);
      break;
    }
    case 'cable': {
      // 고리형 케이블 가이드
      for (let i = 0; i < 5; i++) {
        const ring = box(0.05, h * 0.75, 0.04, chassisMat);
        ring.position.set(-0.18 + i * 0.09, cy, faceZ + 0.02);
        g.add(ring);
      }
      break;
    }
    case 'blank': {
      const stripe = box(FACE_W * 0.94, 0.003, 0.001, mat(0x30343c));
      stripe.position.set(0, cy, faceZ);
      g.add(stripe);
      break;
    }
  }

  // 제품명 라벨 (1U 이상 장비)
  if (!['blank', 'cable', 'shelf', 'patch'].includes(type.style)) {
    const lw = 0.17, lh = 0.011;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(lw, lh),
      new THREE.MeshBasicMaterial({ map: nameLabel(`${type.vendor} ${type.name}`, type.accent) })
    );
    label.position.set(-FACE_W / 2 + lw / 2 + 0.015, h - 0.011, faceZ + 0.0005);
    g.add(label);
  }

  // 포인트 컬러 스트립
  if (!['blank', 'cable', 'shelf'].includes(type.style)) {
    const strip = box(0.004, h * 0.7, 0.002, accentMat);
    addFrontDetail(g, strip, -FACE_W / 2 + 0.008, cy, faceZ);
  }

  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}

/* ── 스타일별 전면 디테일 ─────────────────────────────── */

function addServerFront(g, type, h, cy, z) {
  const bayMat = mat(0x2c313a, { roughness: 0.45 });
  const handleMat = mat(0x9aa3b2, { metalness: 0.7, roughness: 0.3 });
  const rows = Math.max(1, Math.min(type.u, 2));
  const cols = Math.ceil((type.bays || 8) / rows);
  const areaW = UNIT_W * 0.62;
  const bw = areaW / cols - 0.004;
  const bh = Math.min(0.028, (h - 0.012) / rows - 0.004);
  const x0 = -UNIT_W / 2 + 0.035;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bay = box(bw, bh, 0.004, bayMat);
      const x = x0 + c * (areaW / cols) + bw / 2;
      const y = cy + (rows === 1 ? 0 : (r - 0.5) * (bh + 0.006));
      addFrontDetail(g, bay, x, y, z);
      const hd = box(bw * 0.8, 0.0022, 0.0015, handleMat);
      addFrontDetail(g, hd, x, y - bh / 2 + 0.004, z + 0.004);
    }
  }
  // 전원 LED + 컨트롤 패널
  const led = box(0.006, 0.006, 0.002, mat(0x22ff66, { emissive: 0x1bcc55 }));
  addFrontDetail(g, led, UNIT_W / 2 - 0.03, cy + h * 0.2, z);
  const panel = box(0.045, Math.min(0.02, h * 0.4), 0.003, mat(0x11141a));
  addFrontDetail(g, panel, UNIT_W / 2 - 0.055, cy - h * 0.1, z);
}

function addStorageFront(g, type, h, cy, z) {
  const bayMat = mat(0x2a2e36, { roughness: 0.45 });
  const ledMat = mat(0x33ccff, { emissive: 0x1899cc });
  const isLff = type.bayType === 'lff';
  const cols = isLff ? 4 : 12;
  const rows = Math.ceil((type.bays || 12) / cols);
  const areaW = UNIT_W * 0.9;
  const bw = areaW / cols - 0.004;
  const bh = (h - 0.01) / rows - 0.005;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r * cols + c >= type.bays) break;
      const x = -areaW / 2 + c * (areaW / cols) + bw / 2;
      const y = h - 0.008 - bh / 2 - r * (bh + 0.005);
      addFrontDetail(g, box(bw, bh, 0.004, bayMat), x, y, z);
      addFrontDetail(g, box(0.003, 0.003, 0.0015, ledMat), x - bw / 2 + 0.005, y + bh / 2 - 0.005, z + 0.004);
    }
  }
}

function addSwitchFront(g, type, h, cy, z) {
  const portMat = mat(0x0d0f12, { roughness: 0.3 });
  const ledMat = mat(0x39d353, { emissive: 0x2aa940 });
  const ports = type.ports || 48;
  const groups = Math.ceil(ports / 12);
  const groupW = 0.088;
  const totalW = groups * groupW + (groups - 1) * 0.008;
  const x0 = -totalW / 2;
  for (let gi = 0; gi < groups; gi++) {
    for (let p = 0; p < 12 && gi * 12 + p < ports; p++) {
      const col = p % 6, row = Math.floor(p / 6);
      const port = box(0.011, 0.009, 0.003, portMat);
      const x = x0 + gi * (groupW + 0.008) + col * 0.0145 + 0.006;
      const y = cy + (row === 0 ? 0.0065 : -0.0065);
      addFrontDetail(g, port, x, y, z);
      if ((gi * 12 + p) % 4 === 0) {
        addFrontDetail(g, box(0.0025, 0.0025, 0.0015, ledMat), x, y + 0.007, z + 0.003);
      }
    }
  }
}

function addPatchFront(g, type, h, cy, z) {
  const portMat = mat(0x14161a, { roughness: 0.4 });
  const rows = type.u;
  const perRow = (type.ports || 24) / rows;
  for (let r = 0; r < rows; r++) {
    for (let p = 0; p < perRow; p++) {
      const port = box(0.012, 0.012, 0.004, portMat);
      const x = -UNIT_W / 2 + 0.03 + p * ((UNIT_W - 0.06) / perRow) + 0.006;
      const y = U * (rows - r) - U / 2;
      addFrontDetail(g, port, x, y, z);
    }
  }
}

function addUpsFront(g, type, h, cy, z) {
  // 통풍구 슬릿
  const ventMat = mat(0x101318, { roughness: 0.7 });
  const slits = Math.floor(h / 0.012);
  for (let i = 0; i < slits; i++) {
    const slit = box(UNIT_W * 0.5, 0.004, 0.002, ventMat);
    addFrontDetail(g, slit, -UNIT_W * 0.18, 0.01 + i * 0.012, z);
  }
  // LCD 디스플레이
  const lcd = box(0.07, Math.min(0.035, h * 0.45), 0.003, mat(0x1de9b6, { emissive: 0x0da88a, roughness: 0.2 }));
  addFrontDetail(g, lcd, UNIT_W * 0.28, cy, z);
  const btn = box(0.05, 0.008, 0.002, mat(0x3a4150));
  addFrontDetail(g, btn, UNIT_W * 0.28, cy - Math.min(0.03, h * 0.3), z);
}

function addPduFront(g, type, h, cy, z) {
  const outletMat = mat(0x0c0e11, { roughness: 0.3 });
  const n = type.outlets || 8;
  for (let i = 0; i < n; i++) {
    const o = box(0.016, 0.016, 0.003, outletMat);
    const x = -UNIT_W / 2 + 0.04 + i * ((UNIT_W - 0.12) / n);
    addFrontDetail(g, o, x, cy, z);
  }
  const meter = box(0.035, 0.018, 0.003, mat(0xff5533, { emissive: 0xcc3311 }));
  addFrontDetail(g, meter, UNIT_W / 2 - 0.045, cy, z);
}

function addKvmFront(g, type, h, cy, z) {
  const handle = box(UNIT_W * 0.8, 0.007, 0.006, mat(0x848c9c, { metalness: 0.7, roughness: 0.3 }));
  addFrontDetail(g, handle, 0, cy - h * 0.18, z + 0.003);
  const slot = box(UNIT_W * 0.85, 0.003, 0.002, mat(0x0c0e11));
  addFrontDetail(g, slot, 0, cy + h * 0.22, z);
}

/* ── 선반 위 데스크탑형 기기 (랙 슬롯을 차지하지 않음) ─────── */

/**
 * 데스크탑형 기기(노트북·ATX PC·공유기·미니PC·타워형 NAS) 메시 생성.
 * 그룹 원점: 기기 바닥 앞면 중앙, 전면이 +z, 후면이 -z.
 */
export function createDesktopMesh(type) {
  const g = new THREE.Group();
  const w = type.width / 1000;
  const d = Math.max(type.depth / 1000, 0.02);
  const h = Math.max(type.height / 1000, 0.01);

  switch (type.style) {
    case 'laptop': addLaptopModel(g, w, d, h, type); break;
    case 'tower': addTowerModel(g, w, d, h, type); break;
    case 'router': addRouterModel(g, w, d, h, type); break;
    case 'mini': addMiniModel(g, w, d, h, type); break;
    case 'nas-tower': addNasTowerModel(g, w, d, h, type); break;
    default: {
      const body = box(w, h, d, mat(type.accent, { roughness: 0.5 }));
      body.position.set(0, h / 2, -d / 2);
      g.add(body);
    }
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function addLaptopModel(g, w, d, h, type) {
  const bodyMat = mat(0x2b2e34, { roughness: 0.4, metalness: 0.5 });
  const screenMat = mat(0x0a1a2e, { roughness: 0.2, metalness: 0.1, emissive: 0x1a3a5c });
  const accentMat = mat(type.accent, { roughness: 0.3, metalness: 0.6 });
  // 키보드 베이스
  const base = box(w, h, d, bodyMat);
  base.position.set(0, h / 2, -d / 2);
  g.add(base);
  // 뒤로 살짝 기울어 세워진 화면
  const screenH = d * 0.82;
  const screen = box(w * 0.96, screenH, 0.01, screenMat);
  screen.position.set(0, h + screenH * 0.46, -d + 0.015);
  screen.rotation.x = -0.24;
  g.add(screen);
  // 로고 포인트
  const logo = box(0.018, 0.012, 0.003, accentMat);
  logo.position.set(0, h + screenH * 0.78, -d + 0.022);
  logo.rotation.x = -0.24;
  g.add(logo);
}

function addTowerModel(g, w, d, h, type) {
  const bodyMat = mat(0x2a2d33, { roughness: 0.5, metalness: 0.4 });
  const meshMat = mat(0x14161a, { roughness: 0.7 });
  const glassMat = mat(0x0d1b26, { roughness: 0.15, metalness: 0.1 });
  const body = box(w, h, d, bodyMat);
  body.position.set(0, h / 2, -d / 2);
  g.add(body);
  // 전면 통풍 매쉬
  const vent = box(w * 0.72, h * 0.5, 0.006, meshMat);
  vent.position.set(0, h * 0.36, 0.003);
  g.add(vent);
  // 측면 강화유리 패널
  const glass = box(0.006, h * 0.82, d * 0.82, glassMat);
  glass.position.set(w / 2 - 0.004, h * 0.52, -d / 2);
  g.add(glass);
  // 전원 LED
  const led = box(0.006, 0.006, 0.004, mat(type.accent, { emissive: type.accent }));
  led.position.set(0, h * 0.08, 0.005);
  g.add(led);
}

function addRouterModel(g, w, d, h, type) {
  const bodyMat = mat(0x1c1f26, { roughness: 0.55 });
  const ledMat = mat(0x39d353, { emissive: 0x2aa940 });
  const antMat = mat(0x111318, { roughness: 0.4, metalness: 0.5 });
  const body = box(w, h, d, bodyMat);
  body.position.set(0, h / 2, -d / 2);
  g.add(body);
  const antN = 4;
  for (let i = 0; i < antN; i++) {
    const ant = box(0.007, h * 2.4, 0.007, antMat);
    ant.position.set(-w / 2 + 0.02 + i * ((w - 0.04) / (antN - 1)), h + h * 1.15, -d / 2);
    ant.rotation.z = (i - (antN - 1) / 2) * 0.14;
    g.add(ant);
  }
  for (let i = 0; i < 5; i++) {
    const led = box(0.004, 0.004, 0.002, ledMat);
    led.position.set(-w / 2 + 0.02 + i * 0.02, h * 0.62, 0.001);
    g.add(led);
  }
}

function addMiniModel(g, w, d, h, type) {
  const bodyMat = mat(type.accent, { roughness: 0.35, metalness: 0.55 });
  const ventMat = mat(0x0e1013, { roughness: 0.6 });
  const body = box(w, h, d, bodyMat);
  body.position.set(0, h / 2, -d / 2);
  g.add(body);
  const vent = box(w * 0.8, 0.003, d * 0.8, ventMat);
  vent.position.set(0, h + 0.0016, -d / 2);
  g.add(vent);
  const led = box(0.01, 0.01, 0.003, mat(0xffffff, { emissive: 0xaaaaaa }));
  led.position.set(0, h * 0.5, 0.002);
  g.add(led);
}

function addNasTowerModel(g, w, d, h, type) {
  const bodyMat = mat(0x2a2e36, { roughness: 0.5 });
  const bayMat = mat(0x1a1c20, { roughness: 0.4 });
  const ledMat = mat(0x33ccff, { emissive: 0x1899cc });
  const body = box(w, h, d, bodyMat);
  body.position.set(0, h / 2, -d / 2);
  g.add(body);
  const bays = type.bays || 4;
  const bh = (h * 0.82) / bays - 0.004;
  const bw = w * 0.7;
  for (let i = 0; i < bays; i++) {
    const by = h * 0.92 - i * (bh + 0.004) - bh / 2;
    const bay = box(bw, bh, 0.006, bayMat);
    bay.position.set(0, by, 0.003);
    g.add(bay);
    const led = box(0.004, 0.004, 0.002, ledMat);
    led.position.set(bw / 2 - 0.008, by, 0.006);
    g.add(led);
  }
}
