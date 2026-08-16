// 19인치 표준 랙 프레임 및 슬롯 관리
import * as THREE from 'three';
import { U, FACE_W, UNIT_W, createUnitMesh, createDesktopMesh } from './models.js';
import { getType } from './catalog.js';

const RACK_W = 0.6;    // 외형 폭 (m)
const BASE_H = 0.06;   // 하단 베이스 높이
const POST = 0.05;     // 프레임 기둥 단면
const DESK_MARGIN = 0.01;      // 선반 좌우 여백
const DESK_GAP = 0.01;         // 선반 위 기기 간 간격
const DESK_INSET = 0.02;       // 선반 앞쪽 여유(전면 돌출 방지)
const DESK_BACK_MARGIN = 0.01; // 선반 뒤쪽 여유(후면 돌출 방지)

export class Rack {
  constructor(scene, totalU = 42, depthMM = 1000) {
    this.scene = scene;
    this.totalU = totalU;
    this.depthMM = depthMM;
    this.frameOpacity = 1;
    this.group = new THREE.Group();
    this.unitsGroup = new THREE.Group();
    this.placed = new Map();     // instanceId -> { id, typeId, slot, mesh }
    this.deskPlaced = new Map(); // instanceId -> { id, typeId, shelfId, mesh } (선반 위 배치품)
    this.shelfItems = new Map(); // shelfInstanceId -> [{ id, typeId, shelfId, mesh }, ...] (좌→우 순서)
    this.slots = [];           // slot index -> instanceId | null
    this.nextId = 1;
    scene.add(this.group);
    this.build();
  }

  get innerBottom() { return BASE_H; }
  get depthM() { return this.depthMM / 1000; }
  get frontZ() { return this.depthM / 2; }

  build() {
    this.group.clear();
    this.slots = new Array(this.totalU).fill(null);
    const H = this.totalU * U + BASE_H + 0.05;
    const D = this.depthM;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x3d434e, roughness: 0.5, metalness: 0.45,
      transparent: this.frameOpacity < 1, opacity: this.frameOpacity, depthWrite: this.frameOpacity >= 1,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x4b5262, roughness: 0.4, metalness: 0.55,
      transparent: this.frameOpacity < 1, opacity: this.frameOpacity, depthWrite: this.frameOpacity >= 1,
    });
    this.frameMat = frameMat;
    this.railMat = railMat;

    // 베이스 + 상판
    const base = new THREE.Mesh(new THREE.BoxGeometry(RACK_W, BASE_H, D), frameMat);
    base.position.y = BASE_H / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(RACK_W, 0.04, D), frameMat);
    top.position.y = H - 0.02;
    this.group.add(base, top);

    // 4개 코너 기둥
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(POST, H - BASE_H - 0.04, POST), frameMat);
        post.position.set(sx * (RACK_W / 2 - POST / 2), (H + BASE_H - 0.04) / 2, sz * (D / 2 - POST / 2));
        post.castShadow = true;
        this.group.add(post);
      }
    }

    // 전면/후면 마운팅 레일 (19인치 규격 위치)
    const railH = this.totalU * U;
    for (const sx of [-1, 1]) {
      for (const zPos of [D / 2 - 0.09, -D / 2 + 0.09]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.018, railH, 0.012), railMat);
        rail.position.set(sx * (FACE_W / 2 + 0.006), BASE_H + railH / 2, zPos);
        this.group.add(rail);
      }
    }

    // U 눈금 라벨 (캔버스 텍스처)
    const labelTex = this.makeULabels();
    const labelPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.022, railH),
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
    );
    labelPlane.position.set(-(FACE_W / 2 + 0.028), BASE_H + railH / 2, D / 2 - 0.083);
    this.group.add(labelPlane);

    this.group.add(this.unitsGroup);

    // 배치용 레이캐스트 대상 (전면 개구부를 덮는 투명 박스)
    const pickGeo = new THREE.BoxGeometry(FACE_W, railH, 0.06);
    this.pickBox = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.pickBox.position.set(0, BASE_H + railH / 2, D / 2 - 0.03);
    this.group.add(this.pickBox);
  }

  makeULabels() {
    const cv = document.createElement('canvas');
    cv.width = 44; cv.height = this.totalU * 32;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(18,20,24,0.85)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#7f8ba0';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.totalU; i++) {
      // 캔버스 위 = 랙 위이므로 위에서부터 큰 숫자
      ctx.fillText(String(this.totalU - i), cv.width / 2, i * 32 + 16);
      ctx.fillStyle = '#39404e';
      ctx.fillRect(4, i * 32, cv.width - 8, 1);
      ctx.fillStyle = '#7f8ba0';
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  /** 월드 y좌표 → 슬롯 인덱스(0-base). 범위 밖이면 clamp */
  slotFromY(y, unitU = 1) {
    const idx = Math.round((y - BASE_H) / U - 0.5);
    return Math.max(0, Math.min(this.totalU - unitU, idx));
  }

  slotY(slot) { return BASE_H + slot * U; }

  canPlace(slot, unitU, ignoreId = null) {
    if (slot < 0 || slot + unitU > this.totalU) return false;
    for (let i = slot; i < slot + unitU; i++) {
      const occ = this.slots[i];
      if (occ !== null && occ !== ignoreId) return false;
    }
    return true;
  }

  addUnit(typeId, slot) {
    const type = getType(typeId);
    if (!type || !this.canPlace(slot, type.u)) return null;
    const id = this.nextId++;
    const mesh = createUnitMesh(type);
    mesh.position.set(0, this.slotY(slot), this.frontZ - 0.095 - 0.013);
    mesh.userData.instanceId = id;
    this.unitsGroup.add(mesh);
    const inst = { id, typeId, slot, mesh };
    this.placed.set(id, inst);
    for (let i = slot; i < slot + type.u; i++) this.slots[i] = id;
    return inst;
  }

  moveUnit(id, newSlot) {
    const inst = this.placed.get(id);
    if (!inst) return false;
    const type = getType(inst.typeId);
    if (!this.canPlace(newSlot, type.u, id)) return false;
    for (let i = 0; i < this.totalU; i++) if (this.slots[i] === id) this.slots[i] = null;
    for (let i = newSlot; i < newSlot + type.u; i++) this.slots[i] = id;
    inst.slot = newSlot;
    inst.mesh.position.y = this.slotY(newSlot);
    return true;
  }

  /** dir(+1 위 / -1 아래) 방향으로 가장 가까운 배치 가능 슬롯. 없으면 -1 */
  nearestFreeSlot(id, dir) {
    const inst = this.placed.get(id);
    if (!inst) return -1;
    const u = getType(inst.typeId).u;
    for (let s = inst.slot + dir; s >= 0 && s + u <= this.totalU; s += dir) {
      if (this.canPlace(s, u, id)) return s;
    }
    return -1;
  }

  removeUnit(id) {
    const inst = this.placed.get(id);
    if (!inst) return;
    // 선반 위에 배치된 기기도 함께 정리 (메시는 부모 제거로 자동 정리됨)
    for (const item of this.shelfItems.get(id) || []) this.deskPlaced.delete(item.id);
    this.shelfItems.delete(id);
    this.unitsGroup.remove(inst.mesh);
    for (let i = 0; i < this.totalU; i++) if (this.slots[i] === id) this.slots[i] = null;
    this.placed.delete(id);
  }

  clear() {
    for (const id of [...this.placed.keys()]) this.removeUnit(id);
    this.deskPlaced.clear();
    this.shelfItems.clear();
  }

  /** 선반의 앞뒤(깊이 방향) 이동 가능 범위 [minZ, maxZ] (기기 깊이 d 기준) */
  deskZRange(shelfId, d) {
    const shelfInst = this.placed.get(shelfId);
    const shelfType = shelfInst && getType(shelfInst.typeId);
    const shelfD = Math.max((shelfType?.depth ?? 450) / 1000, 0.05);
    let minZ = -(shelfD - DESK_BACK_MARGIN - d / 2);
    let maxZ = -(DESK_INSET + d / 2);
    if (minZ > maxZ) { const mid = -shelfD / 2; minZ = maxZ = mid; }
    return [minZ, maxZ];
  }

  /** 선반 위에 데스크탑형 기기를 배치할 수 있는지(폭 여유) 확인 */
  canAddDeskItem(shelfId, typeId) {
    const shelfInst = this.placed.get(shelfId);
    const shelfType = shelfInst && getType(shelfInst.typeId);
    if (!shelfInst || !shelfType || shelfType.style !== 'shelf') return false;
    const type = getType(typeId);
    if (!type) return false;
    const list = this.shelfItems.get(shelfId) || [];
    const usedW = list.reduce((sum, it) => sum + getType(it.typeId).width / 1000 + DESK_GAP, 0);
    const w = type.width / 1000;
    if (usedW + w > UNIT_W - DESK_MARGIN * 2) return false;
    const d = Math.max(type.depth / 1000, 0.02);
    const x = -UNIT_W / 2 + DESK_MARGIN + usedW + w / 2;
    const [, maxZ] = this.deskZRange(shelfId, d);
    return this.canPlaceDeskItemAt(shelfId, x, maxZ, w, d);
  }

  /** 선반 폭·깊이 안에서 기기 중심 좌표(x, z)가 들어갈 수 있는 범위로 clamp */
  clampDeskPos(shelfId, w, d, x, z) {
    const minX = -UNIT_W / 2 + DESK_MARGIN + w / 2;
    const maxX = UNIT_W / 2 - DESK_MARGIN - w / 2;
    const [minZ, maxZ] = this.deskZRange(shelfId, d);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      z: Math.max(minZ, Math.min(maxZ, z)),
    };
  }

  /** 선반 범위 안 + 다른 기기와 평면(폭×깊이)상 겹치지 않는지 확인 (ignoreId는 이동 중인 자기 자신) */
  canPlaceDeskItemAt(shelfId, x, z, w, d, ignoreId = null) {
    const minX = -UNIT_W / 2 + DESK_MARGIN + w / 2;
    const maxX = UNIT_W / 2 - DESK_MARGIN - w / 2;
    const [minZ, maxZ] = this.deskZRange(shelfId, d);
    if (x < minX - 1e-6 || x > maxX + 1e-6) return false;
    if (z < minZ - 1e-6 || z > maxZ + 1e-6) return false;
    const list = this.shelfItems.get(shelfId) || [];
    for (const other of list) {
      if (other.id === ignoreId) continue;
      const ot = getType(other.typeId);
      const ow = ot.width / 1000, od = Math.max(ot.depth / 1000, 0.02);
      const overlapX = Math.abs(x - other.mesh.position.x) < (w + ow) / 2 + DESK_GAP;
      const overlapZ = Math.abs(z - other.mesh.position.z) < (d + od) / 2 + DESK_GAP;
      if (overlapX && overlapZ) return false;
    }
    return true;
  }

  /** 선반 위 기기를 같은 선반의 평면(폭×깊이) 안에서 이동. 겹치면 실패 */
  moveDeskItem(id, x, z) {
    const item = this.deskPlaced.get(id);
    if (!item) return false;
    const type = getType(item.typeId);
    const w = type.width / 1000, d = Math.max(type.depth / 1000, 0.02);
    const clamped = this.clampDeskPos(item.shelfId, w, d, x, z);
    if (!this.canPlaceDeskItemAt(item.shelfId, clamped.x, clamped.z, w, d, id)) return false;
    item.mesh.position.x = clamped.x;
    item.mesh.position.z = clamped.z;
    return true;
  }

  /** 내부용: 검증 없이 지정 좌표에 데스크탑형 기기 배치 (직렬화 복원 전용) */
  placeDeskItemAt(shelfId, typeId, x, z) {
    const shelfInst = this.placed.get(shelfId);
    const type = getType(typeId);
    if (!shelfInst || !type) return null;
    const id = this.nextId++;
    const mesh = createDesktopMesh(type);
    mesh.position.set(x, 0.012, z);
    mesh.userData.instanceId = id;
    shelfInst.mesh.add(mesh);
    const item = { id, typeId, shelfId, mesh };
    this.deskPlaced.set(id, item);
    const list = this.shelfItems.get(shelfId) || [];
    list.push(item);
    this.shelfItems.set(shelfId, list);
    return item;
  }

  /** 선반(style: 'shelf') 위에 데스크탑형 기기를 앞줄 좌→우로 이어붙여 배치 */
  addDeskItem(shelfId, typeId) {
    if (!this.canAddDeskItem(shelfId, typeId)) return null;
    const type = getType(typeId);
    const list = this.shelfItems.get(shelfId) || [];
    const usedW = list.reduce((sum, it) => sum + getType(it.typeId).width / 1000 + DESK_GAP, 0);
    const w = type.width / 1000;
    const d = Math.max(type.depth / 1000, 0.02);
    const x = -UNIT_W / 2 + DESK_MARGIN + usedW + w / 2;
    const [, maxZ] = this.deskZRange(shelfId, d);
    return this.placeDeskItemAt(shelfId, typeId, x, maxZ);
  }

  removeDeskItem(id) {
    const item = this.deskPlaced.get(id);
    if (!item) return;
    item.mesh.parent?.remove(item.mesh);
    this.deskPlaced.delete(id);
    const list = this.shelfItems.get(item.shelfId) || [];
    const idx = list.findIndex((it) => it.id === id);
    if (idx >= 0) list.splice(idx, 1);
  }

  /** 랙 크기(U) 변경 — 들어갈 수 있는 유닛은 유지 */
  resize(totalU) {
    const saved = this.serialize().units;
    this.clear();
    this.totalU = totalU;
    this.build();
    for (const u of saved) {
      const type = getType(u.typeId);
      if (type && u.slot + type.u <= totalU) {
        const inst = this.addUnit(u.typeId, u.slot);
        if (inst) this.restoreDeskItems(inst.id, u.deskItems);
      }
    }
  }

  /** 직렬화된 deskItems를 복원 — 좌표가 있으면 그대로, 없으면(구버전 typeId만 저장) 자동 배치 */
  restoreDeskItems(shelfId, deskItems) {
    for (const dt of deskItems || []) {
      if (typeof dt === 'string') this.addDeskItem(shelfId, dt);
      else this.placeDeskItemAt(shelfId, dt.typeId, dt.x, dt.z);
    }
  }

  /** 프레임(베이스·상판·기둥·레일) 투명도 설정. opacity: 0(완전 투명)~1(불투명) */
  setFrameOpacity(opacity) {
    this.frameOpacity = Math.max(0, Math.min(1, opacity));
    for (const mat of [this.frameMat, this.railMat]) {
      if (!mat) continue;
      mat.transparent = this.frameOpacity < 1;
      mat.opacity = this.frameOpacity;
      mat.depthWrite = this.frameOpacity >= 1;
      mat.needsUpdate = true;
    }
  }

  /** 랙 깊이(mm) 변경 — 배치된 유닛은 그대로 유지(깊이 초과 시 후면이 돌출될 수 있음) */
  resizeDepth(depthMM) {
    const saved = this.serialize().units;
    this.clear();
    this.depthMM = depthMM;
    this.build();
    for (const u of saved) {
      const inst = this.addUnit(u.typeId, u.slot);
      if (inst) this.restoreDeskItems(inst.id, u.deskItems);
    }
  }

  serialize() {
    return {
      rackU: this.totalU,
      rackDepth: this.depthMM,
      units: [...this.placed.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((u) => ({
          typeId: u.typeId,
          slot: u.slot,
          deskItems: (this.shelfItems.get(u.id) || []).map((it) => ({
            typeId: it.typeId,
            x: Number(it.mesh.position.x.toFixed(4)),
            z: Number(it.mesh.position.z.toFixed(4)),
          })),
        })),
    };
  }

  load(data) {
    this.clear();
    let rebuild = false;
    if (data.rackU && data.rackU !== this.totalU) { this.totalU = data.rackU; rebuild = true; }
    if (data.rackDepth && data.rackDepth !== this.depthMM) { this.depthMM = data.rackDepth; rebuild = true; }
    if (rebuild) this.build();
    for (const u of data.units || []) {
      const inst = this.addUnit(u.typeId, u.slot);
      if (inst) this.restoreDeskItems(inst.id, u.deskItems);
    }
  }

  /** 레이캐스트 히트 → 소속 유닛/선반 배치품 인스턴스 (자식이 우선) */
  instanceFromObject(obj) {
    let o = obj;
    while (o) {
      if (o.userData?.instanceId) {
        return this.placed.get(o.userData.instanceId) || this.deskPlaced.get(o.userData.instanceId) || null;
      }
      o = o.parent;
    }
    return null;
  }

  stats() {
    let usedU = 0, power = 0, weight = 0, price = 0;
    for (const inst of this.placed.values()) {
      const t = getType(inst.typeId);
      usedU += t.u; power += t.power; weight += t.weight; price += t.price;
    }
    for (const item of this.deskPlaced.values()) {
      const t = getType(item.typeId);
      power += t.power; weight += t.weight; price += t.price;
    }
    return { usedU, power, weight, price, totalU: this.totalU };
  }
}
