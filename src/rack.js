// 19인치 표준 랙 프레임 및 슬롯 관리
import * as THREE from 'three';
import { U, FACE_W, createUnitMesh } from './models.js';
import { getType } from './catalog.js';

const RACK_W = 0.6;    // 외형 폭 (m)
const RACK_D = 1.0;    // 외형 깊이 (m)
const BASE_H = 0.06;   // 하단 베이스 높이
const POST = 0.05;     // 프레임 기둥 단면

export class Rack {
  constructor(scene, totalU = 42) {
    this.scene = scene;
    this.totalU = totalU;
    this.group = new THREE.Group();
    this.unitsGroup = new THREE.Group();
    this.placed = new Map();   // instanceId -> { id, typeId, slot, mesh }
    this.slots = [];           // slot index -> instanceId | null
    this.nextId = 1;
    scene.add(this.group);
    this.build();
  }

  get innerBottom() { return BASE_H; }
  get frontZ() { return RACK_D / 2; }

  build() {
    this.group.clear();
    this.slots = new Array(this.totalU).fill(null);
    const H = this.totalU * U + BASE_H + 0.05;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3d434e, roughness: 0.5, metalness: 0.45 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x4b5262, roughness: 0.4, metalness: 0.55 });

    // 베이스 + 상판
    const base = new THREE.Mesh(new THREE.BoxGeometry(RACK_W, BASE_H, RACK_D), frameMat);
    base.position.y = BASE_H / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(RACK_W, 0.04, RACK_D), frameMat);
    top.position.y = H - 0.02;
    this.group.add(base, top);

    // 4개 코너 기둥
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(POST, H - BASE_H - 0.04, POST), frameMat);
        post.position.set(sx * (RACK_W / 2 - POST / 2), (H + BASE_H - 0.04) / 2, sz * (RACK_D / 2 - POST / 2));
        post.castShadow = true;
        this.group.add(post);
      }
    }

    // 전면/후면 마운팅 레일 (19인치 규격 위치)
    const railH = this.totalU * U;
    for (const sx of [-1, 1]) {
      for (const zPos of [RACK_D / 2 - 0.09, -RACK_D / 2 + 0.09]) {
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
    labelPlane.position.set(-(FACE_W / 2 + 0.028), BASE_H + railH / 2, RACK_D / 2 - 0.083);
    this.group.add(labelPlane);

    this.group.add(this.unitsGroup);

    // 배치용 레이캐스트 대상 (전면 개구부를 덮는 투명 박스)
    const pickGeo = new THREE.BoxGeometry(FACE_W, railH, 0.06);
    this.pickBox = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.pickBox.position.set(0, BASE_H + railH / 2, RACK_D / 2 - 0.03);
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

  removeUnit(id) {
    const inst = this.placed.get(id);
    if (!inst) return;
    this.unitsGroup.remove(inst.mesh);
    for (let i = 0; i < this.totalU; i++) if (this.slots[i] === id) this.slots[i] = null;
    this.placed.delete(id);
  }

  clear() {
    for (const id of [...this.placed.keys()]) this.removeUnit(id);
  }

  /** 랙 크기 변경 — 들어갈 수 있는 유닛은 유지 */
  resize(totalU) {
    const saved = this.serialize().units;
    this.clear();
    this.totalU = totalU;
    this.build();
    for (const u of saved) {
      const type = getType(u.typeId);
      if (type && u.slot + type.u <= totalU) this.addUnit(u.typeId, u.slot);
    }
  }

  serialize() {
    return {
      rackU: this.totalU,
      units: [...this.placed.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((u) => ({ typeId: u.typeId, slot: u.slot })),
    };
  }

  load(data) {
    this.clear();
    if (data.rackU && data.rackU !== this.totalU) {
      this.totalU = data.rackU;
      this.build();
    }
    for (const u of data.units || []) this.addUnit(u.typeId, u.slot);
  }

  /** 레이캐스트 히트 → 소속 유닛 인스턴스 */
  instanceFromObject(obj) {
    let o = obj;
    while (o) {
      if (o.userData?.instanceId) return this.placed.get(o.userData.instanceId);
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
    return { usedU, power, weight, price, totalU: this.totalU };
  }
}
