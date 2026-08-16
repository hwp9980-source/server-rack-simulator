import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG, CATEGORIES, getType } from './catalog.js';
import { Rack } from './rack.js';
import { U, FACE_W, UNIT_W } from './models.js';

const STORAGE_KEY = 'rack-sim-config-v1';

/* ── 3D 씬 구성 ─────────────────────────────────────── */
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
scene.fog = new THREE.Fog(0x14161a, 8, 18);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
camera.position.set(1.9, 1.7, 2.6);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 0.5;
controls.maxDistance = 8;

// 조명
scene.add(new THREE.HemisphereLight(0xc5cfe4, 0x4a5160, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3; key.shadow.camera.right = 3;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -2;
key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight(0xaaccff, 1.0);
fill.position.set(-3, 2, -2);
scene.add(fill);
const front = new THREE.DirectionalLight(0xffffff, 0.8);
front.position.set(0.5, 2, 5);
scene.add(front);

// 바닥 (데이터센터 타일 느낌)
const floorMat = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.85, metalness: 0.1 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(30, 50, 0x2c313c, 0x22262e);
grid.position.y = 0.001;
scene.add(grid);

/* ── 랙 & 고스트 ────────────────────────────────────── */
let rack = new Rack(scene, 42, 1000);

const ghostMat = new THREE.MeshStandardMaterial({
  color: 0x3fb950, transparent: true, opacity: 0.4, depthWrite: false,
});
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
ghost.visible = false;
scene.add(ghost);

const selBox = new THREE.Box3Helper(new THREE.Box3(), 0x4f8cff);
selBox.visible = false;
scene.add(selBox);

/* ── 상태 ───────────────────────────────────────────── */
let placingType = null;      // 카탈로그에서 선택된 타입 (배치 모드)
let selectedId = null;       // 선택된 배치 유닛
let dragging = null;         // { id, origSlot, moved }
let hoverSlot = -1;
let hoverValid = false;
let hoverShelfId = null;     // 데스크탑형 배치 모드에서 호버 중인 선반 id
let hoverDeskPos = null;     // 선반 위 기기 드래그 중 호버 좌표(로컬, {x, z})

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/* ── UI: 카탈로그 ───────────────────────────────────── */
const listEl = document.getElementById('catalog-list');
const chipsEl = document.getElementById('category-chips');
const searchEl = document.getElementById('catalog-search');
let activeCategory = 'all';

function fmtWon(n) { return '₩' + n.toLocaleString('ko-KR'); }

function renderChips() {
  chipsEl.innerHTML = '';
  for (const c of CATEGORIES) {
    const el = document.createElement('button');
    el.className = 'chip' + (c.id === activeCategory ? ' active' : '');
    el.textContent = c.label;
    el.onclick = () => { activeCategory = c.id; renderChips(); renderCatalog(); };
    chipsEl.appendChild(el);
  }
}

function renderCatalog() {
  const q = searchEl.value.trim().toLowerCase();
  listEl.innerHTML = '';
  for (const t of CATALOG) {
    if (activeCategory !== 'all' && t.category !== activeCategory) continue;
    if (q && !(`${t.vendor} ${t.name}`.toLowerCase().includes(q))) continue;
    const card = document.createElement('div');
    card.className = 'unit-card' + (placingType?.id === t.id ? ' placing' : '');
    card.innerHTML = `
      <div class="uc-top">
        <span class="uc-dot" style="background:#${t.accent.toString(16).padStart(6, '0')}"></span>
        <span class="uc-name">${t.vendor} ${t.name}</span>
        <span class="uc-u">${t.u > 0 ? t.u + 'U' : '선반형'}</span>
      </div>
      <div class="uc-meta">
        <span>${t.power ? t.power + 'W' : '—'}</span>
        <span>${t.weight}kg</span>
        <span>${fmtWon(t.price)}</span>
      </div>`;
    card.onclick = () => togglePlacing(t);
    listEl.appendChild(card);
  }
}

function togglePlacing(type) {
  placingType = placingType?.id === type.id ? null : type;
  selectUnit(null);
  const hintEl = document.getElementById('placement-hint');
  hintEl.classList.toggle('hidden', !placingType);
  if (placingType) {
    if (placingType.category === 'desktop') {
      const hasShelf = [...rack.placed.values()].some((inst) => getType(inst.typeId).style === 'shelf');
      hintEl.innerHTML = hasShelf
        ? '선반 위 빈 자리를 클릭해 배치 · <b>Shift</b>+클릭 연속 배치 · <b>ESC</b> 취소'
        : '먼저 카탈로그에서 <b>고정 선반</b>을 랙에 배치하세요';
    } else {
      hintEl.innerHTML = '랙의 원하는 위치를 클릭해 장착 · <b>Shift</b>+클릭 연속 배치 · <b>ESC</b> 취소';
    }
  }
  if (!placingType) ghost.visible = false;
  renderCatalog();
}

searchEl.addEventListener('input', renderCatalog);
renderChips();
renderCatalog();

/* ── UI: 인스펙터 & 통계 ────────────────────────────── */
const inspEl = document.getElementById('inspector');

function selectUnit(id) {
  selectedId = id;
  if (!id) { inspEl.classList.add('hidden'); selBox.visible = false; return; }
  const deskItem = rack.deskPlaced.get(id);
  const inst = deskItem || rack.placed.get(id);
  if (!inst) return;
  const t = getType(inst.typeId);
  document.getElementById('insp-name').textContent = t.name;
  document.getElementById('insp-vendor').textContent = t.vendor;
  if (deskItem) {
    document.getElementById('insp-specs').innerHTML = `
      <tr><td>배치 위치</td><td>선반 위</td></tr>
      <tr><td>크기(W×D×H)</td><td>${t.width}×${t.depth}×${t.height} mm</td></tr>
      <tr><td>소비전력</td><td>${t.power ? t.power + ' W' : '—'}</td></tr>
      <tr><td>무게</td><td>${t.weight} kg</td></tr>
      <tr><td>가격</td><td>${fmtWon(t.price)}</td></tr>`;
    document.getElementById('insp-up').disabled = true;
    document.getElementById('insp-down').disabled = true;
    document.getElementById('insp-hint').innerHTML =
      '선반 위에서 앞뒤·좌우로 드래그해 이동 · <b>Delete</b>로 제거<br />다른 기기와 겹치는 위치로는 이동할 수 없습니다';
  } else {
    document.getElementById('insp-specs').innerHTML = `
      <tr><td>위치</td><td>${inst.slot + 1}U ~ ${inst.slot + t.u}U</td></tr>
      <tr><td>높이</td><td>${t.u}U</td></tr>
      <tr><td>깊이</td><td>${t.depth} mm</td></tr>
      <tr><td>소비전력</td><td>${t.power ? t.power + ' W' : '—'}</td></tr>
      <tr><td>무게</td><td>${t.weight} kg</td></tr>
      <tr><td>가격</td><td>${fmtWon(t.price)}</td></tr>`;
    document.getElementById('insp-up').disabled = rack.nearestFreeSlot(id, 1) < 0;
    document.getElementById('insp-down').disabled = rack.nearestFreeSlot(id, -1) < 0;
    document.getElementById('insp-hint').innerHTML =
      '드래그 또는 <b>Shift</b>+↑/↓로 이동 · <b>Delete</b>로 제거<br />막힌 방향은 다음 빈 자리로 건너뜁니다';
  }
  inspEl.classList.remove('hidden');
  updateSelBox();
}

function updateSelBox() {
  const inst = selectedId && (rack.placed.get(selectedId) || rack.deskPlaced.get(selectedId));
  if (!inst) { selBox.visible = false; return; }
  selBox.box.setFromObject(inst.mesh);
  selBox.visible = true;
}

function updateStats() {
  const s = rack.stats();
  document.getElementById('stat-units').textContent = `${s.usedU} / ${s.totalU}U`;
  document.getElementById('stat-power').textContent = `${s.power.toLocaleString()} W`;
  document.getElementById('stat-weight').textContent = `${s.weight.toFixed(1)} kg`;
  document.getElementById('stat-price').textContent = fmtWon(s.price);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rack.serialize()));
  updateStats();
  updateSelBox();
}

// 위/아래 이동: 인접 칸이 차 있으면 장애물을 건너뛰어 다음 빈 자리로 (랙 유닛에만 적용)
function nudgeUnit(dir) {
  if (!selectedId || !rack.placed.has(selectedId)) return;
  const target = rack.nearestFreeSlot(selectedId, dir);
  if (target >= 0 && rack.moveUnit(selectedId, target)) {
    selectUnit(selectedId);
    persist();
  }
}
document.getElementById('insp-up').onclick = () => nudgeUnit(1);
document.getElementById('insp-down').onclick = () => nudgeUnit(-1);
document.getElementById('insp-remove').onclick = () => {
  if (rack.deskPlaced.has(selectedId)) rack.removeDeskItem(selectedId);
  else rack.removeUnit(selectedId);
  selectUnit(null);
  persist();
};
document.getElementById('insp-dup').onclick = () => {
  const deskItem = rack.deskPlaced.get(selectedId);
  if (deskItem) {
    const ni = rack.addDeskItem(deskItem.shelfId, deskItem.typeId);
    if (ni) { selectUnit(ni.id); persist(); }
    else alert('선반에 더 이상 공간이 없습니다.');
    return;
  }
  const inst = rack.placed.get(selectedId);
  if (!inst) return;
  const t = getType(inst.typeId);
  for (let s = 0; s <= rack.totalU - t.u; s++) {
    if (rack.canPlace(s, t.u)) {
      const ni = rack.addUnit(inst.typeId, s);
      selectUnit(ni.id);
      persist();
      return;
    }
  }
};

/* ── 포인터 인터랙션 ────────────────────────────────── */
function setPointer(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function raycastSlot(unitU) {
  const hits = raycaster.intersectObject(rack.pickBox);
  if (!hits.length) return -1;
  return rack.slotFromY(hits[0].point.y - (unitU * U) / 2 + U / 2, unitU);
}

function showGhost(type, ignoreId = null) {
  const slot = raycastSlot(type.u);
  if (slot < 0) { ghost.visible = false; hoverSlot = -1; return; }
  hoverSlot = slot;
  hoverValid = rack.canPlace(slot, type.u, ignoreId);
  const h = type.u * U;
  ghost.scale.set(FACE_W, h - 0.004, Math.max(type.depth / 1000, 0.05));
  ghost.position.set(0, rack.slotY(slot) + h / 2, rack.frontZ - 0.108 - ghost.scale.z / 2);
  ghostMat.color.set(hoverValid ? 0x3fb950 : 0xe5534b);
  ghost.visible = true;
}

// 선반(style: 'shelf') 인스턴스 레이캐스트 — 선반의 얇은 트레이 형상이 아니라
// 배치용 대형 히트박스(pickBox)로 슬롯을 찾은 뒤 그 슬롯의 유닛이 선반인지 확인한다
// (선반 위 기기 클릭 시에도 아래 선반을 항상 안정적으로 인식할 수 있도록)
function raycastShelf() {
  const hits = raycaster.intersectObject(rack.pickBox);
  if (!hits.length) return null;
  const slot = rack.slotFromY(hits[0].point.y, 1);
  const id = rack.slots[slot];
  if (!id) return null;
  const inst = rack.placed.get(id);
  return inst && getType(inst.typeId).style === 'shelf' ? inst : null;
}

// 선반 위 데스크탑형 기기 배치 고스트 (앞줄 좌→우로 이어붙는 다음 자리에 미리보기)
function showDeskGhost(type) {
  const shelfInst = raycastShelf();
  if (!shelfInst) { ghost.visible = false; hoverShelfId = null; return; }
  hoverShelfId = shelfInst.id;
  hoverValid = rack.canAddDeskItem(shelfInst.id, type.id);
  const list = rack.shelfItems.get(shelfInst.id) || [];
  const w = type.width / 1000, d = Math.max(type.depth / 1000, 0.02), h = Math.max(type.height / 1000, 0.01);
  const usedW = list.reduce((sum, it) => sum + getType(it.typeId).width / 1000 + 0.01, 0);
  const x = -UNIT_W / 2 + 0.01 + usedW + w / 2;
  const [, maxZ] = rack.deskZRange(shelfInst.id, d);
  ghost.scale.set(w, h, d);
  ghost.position.set(
    shelfInst.mesh.position.x + x,
    shelfInst.mesh.position.y + 0.012 + h / 2,
    shelfInst.mesh.position.z + maxZ
  );
  ghostMat.color.set(hoverValid ? 0x3fb950 : 0xe5534b);
  ghost.visible = true;
}

// 선반 평면(수평) — 드래그 중인 기기의 앞뒤·좌우 위치를 알아내기 위한 레이캐스트 대상
const _deskPlane = new THREE.Plane();
const _deskPlaneHit = new THREE.Vector3();

// 선반 위 기기 드래그 중 고스트 — 같은 선반의 평면(폭×깊이) 안에서 자유롭게 이동
function showDeskDragGhost(id) {
  const item = rack.deskPlaced.get(id);
  if (!item) { ghost.visible = false; hoverDeskPos = null; return; }
  const shelfInst = rack.placed.get(item.shelfId);
  if (!shelfInst) { ghost.visible = false; hoverDeskPos = null; return; }
  const type = getType(item.typeId);
  const w = type.width / 1000, d = Math.max(type.depth / 1000, 0.02), h = Math.max(type.height / 1000, 0.01);
  const surfaceY = shelfInst.mesh.position.y + 0.012;
  _deskPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, surfaceY, 0));
  const hit = raycaster.ray.intersectPlane(_deskPlane, _deskPlaneHit);
  if (!hit) { ghost.visible = false; hoverDeskPos = null; return; }
  const rawX = hit.x - shelfInst.mesh.position.x;
  const rawZ = hit.z - shelfInst.mesh.position.z;
  const clamped = rack.clampDeskPos(item.shelfId, w, d, rawX, rawZ);
  hoverDeskPos = clamped;
  hoverValid = rack.canPlaceDeskItemAt(item.shelfId, clamped.x, clamped.z, w, d, id);
  ghost.scale.set(w, h, d);
  ghost.position.set(
    shelfInst.mesh.position.x + clamped.x,
    surfaceY + h / 2,
    shelfInst.mesh.position.z + clamped.z
  );
  ghostMat.color.set(hoverValid ? 0x3fb950 : 0xe5534b);
  ghost.visible = true;
}

canvas.addEventListener('pointermove', (e) => {
  setPointer(e);
  if (placingType) {
    if (placingType.category === 'desktop') showDeskGhost(placingType);
    else showGhost(placingType);
  } else if (dragging) {
    dragging.moved = true;
    if (dragging.kind === 'desk') showDeskDragGhost(dragging.id);
    else {
      const t = getType(rack.placed.get(dragging.id).typeId);
      showGhost(t, dragging.id);
    }
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || placingType) return;
  setPointer(e);
  const hits = raycaster.intersectObjects(rack.unitsGroup.children, true);
  const inst = hits.length ? rack.instanceFromObject(hits[0].object) : null;
  if (inst) {
    selectUnit(inst.id);
    if (rack.placed.has(inst.id)) {
      dragging = { kind: 'unit', id: inst.id, origSlot: inst.slot, moved: false };
      controls.enabled = false;
    } else if (rack.deskPlaced.has(inst.id)) {
      dragging = { kind: 'desk', id: inst.id, moved: false };
      controls.enabled = false;
    }
  } else {
    selectUnit(null);
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (dragging) {
    if (dragging.moved) {
      if (dragging.kind === 'desk') {
        if (hoverDeskPos !== null && hoverValid) {
          rack.moveDeskItem(dragging.id, hoverDeskPos.x, hoverDeskPos.z);
          selectUnit(dragging.id);
          persist();
        }
      } else if (hoverSlot >= 0 && hoverValid) {
        rack.moveUnit(dragging.id, hoverSlot);
        selectUnit(dragging.id);
        persist();
      }
    }
    ghost.visible = false;
    dragging = null;
    controls.enabled = true;
    return;
  }
  if (placingType && e.button === 0) {
    setPointer(e);
    if (placingType.category === 'desktop') {
      showDeskGhost(placingType);
      if (hoverShelfId && hoverValid) {
        const item = rack.addDeskItem(hoverShelfId, placingType.id);
        persist();
        if (!e.shiftKey) togglePlacing(placingType);
        else showDeskGhost(placingType);
        if (item && !placingType) selectUnit(item.id);
      }
    } else {
      showGhost(placingType);
      if (hoverSlot >= 0 && hoverValid) {
        const inst = rack.addUnit(placingType.id, hoverSlot);
        persist();
        if (!e.shiftKey) togglePlacing(placingType); // 모드 해제
        else showGhost(placingType);
        if (inst && !placingType) selectUnit(inst.id);
      }
    }
  }
});

canvas.addEventListener('pointerleave', () => { if (!dragging) ghost.visible = false; });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && placingType) togglePlacing(placingType);
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId
      && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    if (rack.deskPlaced.has(selectedId)) rack.removeDeskItem(selectedId);
    else rack.removeUnit(selectedId);
    selectUnit(null);
    persist();
  }
});

/* ── 카메라 프리셋 ──────────────────────────────────── */
let camAnim = null;
function flyTo(pos, target) {
  camAnim = {
    fromP: camera.position.clone(), toP: new THREE.Vector3(...pos),
    fromT: controls.target.clone(), toT: new THREE.Vector3(...target),
    t: 0,
  };
}
function rackMidY() { return (rack.totalU * U) / 2 + 0.1; }
document.getElementById('view-front').onclick = () => flyTo([0, rackMidY(), 2.8], [0, rackMidY(), 0]);
document.getElementById('view-rear').onclick = () => flyTo([0, rackMidY(), -2.8], [0, rackMidY(), 0]);
document.getElementById('view-iso').onclick = () => flyTo([1.9, rackMidY() + 0.6, 2.6], [0, rackMidY() - 0.2, 0]);

/* ── 카메라 조작 패드 ───────────────────────────────── */
const _sph = new THREE.Spherical();
const _off = new THREE.Vector3();

// 궤도 회전 (dAz: 좌우, dPol: 상하, 라디안)
function orbitBy(dAz, dPol) {
  camAnim = null;
  _off.subVectors(camera.position, controls.target);
  _sph.setFromVector3(_off);
  _sph.theta -= dAz;
  _sph.phi = Math.max(0.08, Math.min(controls.maxPolarAngle, _sph.phi - dPol));
  _off.setFromSpherical(_sph);
  camera.position.copy(controls.target).add(_off);
  camera.lookAt(controls.target);
}

// 줌 (factor < 1 확대, > 1 축소)
function zoomBy(factor) {
  camAnim = null;
  _off.subVectors(camera.position, controls.target);
  const r = Math.max(controls.minDistance, Math.min(controls.maxDistance, _off.length() * factor));
  _off.setLength(r);
  camera.position.copy(controls.target).add(_off);
}

function resetView() {
  flyTo([1.9, rackMidY() + 0.6, 2.6], [0, rackMidY() - 0.2, 0]);
}

const CAM_STEP = { rot: 0.045, zoomIn: 0.965, zoomOut: 1.036 };
const CAM_ACTIONS = {
  left:    () => orbitBy(-CAM_STEP.rot, 0),
  right:   () => orbitBy(CAM_STEP.rot, 0),
  up:      () => orbitBy(0, CAM_STEP.rot),
  down:    () => orbitBy(0, -CAM_STEP.rot),
  zoomin:  () => zoomBy(CAM_STEP.zoomIn),
  zoomout: () => zoomBy(CAM_STEP.zoomOut),
};

// 버튼을 누르고 있는 동안 반복 실행
let camHold = null;
function stopCamHold() {
  if (camHold) { clearInterval(camHold); camHold = null; }
}
for (const btn of document.querySelectorAll('.cam-btn')) {
  const action = btn.dataset.cam;
  if (action === 'reset') { btn.onclick = resetView; continue; }
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    CAM_ACTIONS[action]();
    stopCamHold();
    camHold = setInterval(CAM_ACTIONS[action], 30);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    btn.addEventListener(ev, stopCamHold);
  }
}

// 키보드: 화살표 회전, +/- 줌, Home 초기화
const CAM_KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  '+': 'zoomin', '=': 'zoomin', '-': 'zoomout', '_': 'zoomout',
};
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  // Shift+↑/↓: 선택 유닛 이동 (카메라 회전보다 우선)
  if (e.shiftKey && selectedId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    nudgeUnit(e.key === 'ArrowUp' ? 1 : -1);
    e.preventDefault();
    return;
  }
  if (e.key === 'Home') { resetView(); e.preventDefault(); return; }
  const action = CAM_KEYS[e.key];
  if (action) { CAM_ACTIONS[action](); e.preventDefault(); }
});

/* ── 툴바 ───────────────────────────────────────────── */
const RACK_MIN_U = 2, RACK_MAX_U = 60;
const rackSizeInput = document.getElementById('rack-size');

function syncRackSizeUI() {
  rackSizeInput.value = String(rack.totalU);
  document.querySelectorAll('.btn.preset').forEach((b) => {
    b.classList.toggle('active', parseInt(b.dataset.u, 10) === rack.totalU);
  });
}

function setRackSize(u) {
  u = Math.max(RACK_MIN_U, Math.min(RACK_MAX_U, Math.round(u)));
  if (Number.isNaN(u) || u === rack.totalU) { syncRackSizeUI(); return; }
  // 줄어드는 크기에 들어가지 못하는 유닛 확인
  const dropped = [...rack.placed.values()]
    .filter((inst) => inst.slot + getType(inst.typeId).u > u).length;
  if (dropped > 0 && !confirm(`${u}U로 줄이면 상단 구성품 ${dropped}개가 제거됩니다. 계속할까요?`)) {
    syncRackSizeUI();
    return;
  }
  rack.resize(u);
  selectUnit(null);
  persist();
  syncRackSizeUI();
}

rackSizeInput.addEventListener('change', () => setRackSize(parseInt(rackSizeInput.value, 10)));
document.getElementById('rack-dec').onclick = () => setRackSize(rack.totalU - 1);
document.getElementById('rack-inc').onclick = () => setRackSize(rack.totalU + 1);
document.querySelectorAll('.btn.preset').forEach((b) => {
  b.onclick = () => setRackSize(parseInt(b.dataset.u, 10));
});

const RACK_MIN_DEPTH = 500, RACK_MAX_DEPTH = 1200, RACK_DEPTH_STEP = 50;
const rackDepthInput = document.getElementById('rack-depth');

function syncRackDepthUI() {
  rackDepthInput.value = String(rack.depthMM);
  document.querySelectorAll('.btn.preset-depth').forEach((b) => {
    b.classList.toggle('active', parseInt(b.dataset.d, 10) === rack.depthMM);
  });
}

function setRackDepth(mm) {
  mm = Math.max(RACK_MIN_DEPTH, Math.min(RACK_MAX_DEPTH, Math.round(mm / RACK_DEPTH_STEP) * RACK_DEPTH_STEP));
  if (Number.isNaN(mm) || mm === rack.depthMM) { syncRackDepthUI(); return; }
  // 랙보다 깊은 구성품이 있으면 후면 돌출 경고
  const deeper = [...rack.placed.values()]
    .filter((inst) => getType(inst.typeId).depth > mm).length;
  if (deeper > 0 && !confirm(`${mm}mm로 줄이면 랙보다 깊은 구성품 ${deeper}개의 후면이 랙 밖으로 돌출됩니다. 계속할까요?`)) {
    syncRackDepthUI();
    return;
  }
  rack.resizeDepth(mm);
  updateSelBox();
  persist();
  syncRackDepthUI();
}

rackDepthInput.addEventListener('change', () => setRackDepth(parseInt(rackDepthInput.value, 10)));
document.getElementById('depth-dec').onclick = () => setRackDepth(rack.depthMM - RACK_DEPTH_STEP);
document.getElementById('depth-inc').onclick = () => setRackDepth(rack.depthMM + RACK_DEPTH_STEP);
document.querySelectorAll('.btn.preset-depth').forEach((b) => {
  b.onclick = () => setRackDepth(parseInt(b.dataset.d, 10));
});

document.getElementById('frame-transparent').addEventListener('change', (e) => {
  rack.setFrameOpacity(e.target.checked ? 0.12 : 1);
});

document.getElementById('btn-clear').onclick = () => {
  if (rack.placed.size === 0 || confirm('랙의 모든 구성품을 제거할까요?')) {
    rack.clear();
    selectUnit(null);
    persist();
  }
};

document.getElementById('btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify(rack.serialize(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rack-config.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

const importFile = document.getElementById('import-file');
document.getElementById('btn-import').onclick = () => importFile.click();
importFile.onchange = async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    rack.load(data);
    syncRackSizeUI();
    selectUnit(null);
    persist();
  } catch {
    alert('불러올 수 없는 파일입니다.');
  }
  importFile.value = '';
};

/* ── 저장된 구성 복원 ───────────────────────────────── */
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) rack.load(JSON.parse(saved));
} catch { /* 무시 */ }
syncRackSizeUI();
updateStats();

// 콘솔/테스트 디버깅용 핸들
window.__sim = { rack: () => rack, scene, camera, raycaster };

/* ── 렌더 루프 ──────────────────────────────────────── */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);

renderer.setAnimationLoop(() => {
  resize();
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + 0.035);
    const k = 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.fromP, camAnim.toP, k);
    controls.target.lerpVectors(camAnim.fromT, camAnim.toT, k);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  renderer.render(scene, camera);
});
