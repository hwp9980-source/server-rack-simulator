// 구성품 카탈로그 — 실제 시판 장비 사양 기반
// u: 랙 유닛 높이, depth: 섀시 깊이(mm), power: 정격 소비전력(W),
// weight: kg, price: 대략적인 시장가(₩), accent: 전면 포인트 색상

export const CATEGORIES = [
  { id: 'all',     label: '전체' },
  { id: 'server',  label: '서버' },
  { id: 'storage', label: '스토리지' },
  { id: 'network', label: '네트워크' },
  { id: 'power',   label: '전원' },
  { id: 'misc',    label: '기타' },
];

export const CATALOG = [
  // ── 서버 ──────────────────────────────────────────────
  {
    id: 'dell-r660', category: 'server', vendor: 'Dell',
    name: 'PowerEdge R660', u: 1, depth: 810, power: 700, weight: 19.2,
    price: 8500000, accent: 0x2b7de9, style: 'server', bays: 8,
  },
  {
    id: 'dell-r760', category: 'server', vendor: 'Dell',
    name: 'PowerEdge R760', u: 2, depth: 810, power: 1100, weight: 28.9,
    price: 12800000, accent: 0x2b7de9, style: 'server', bays: 16,
  },
  {
    id: 'dell-r960', category: 'server', vendor: 'Dell',
    name: 'PowerEdge R960', u: 4, depth: 850, power: 2400, weight: 52.0,
    price: 34000000, accent: 0x2b7de9, style: 'server', bays: 24,
  },
  {
    id: 'hpe-dl360', category: 'server', vendor: 'HPE',
    name: 'ProLiant DL360 Gen11', u: 1, depth: 774, power: 800, weight: 16.3,
    price: 9200000, accent: 0x01a982, style: 'server', bays: 8,
  },
  {
    id: 'hpe-dl380', category: 'server', vendor: 'HPE',
    name: 'ProLiant DL380 Gen11', u: 2, depth: 730, power: 1000, weight: 25.0,
    price: 13500000, accent: 0x01a982, style: 'server', bays: 12,
  },
  {
    id: 'smc-1029', category: 'server', vendor: 'Supermicro',
    name: 'SuperServer 1029P', u: 1, depth: 730, power: 750, weight: 17.5,
    price: 6800000, accent: 0x8dc63f, style: 'server', bays: 10,
  },
  {
    id: 'lenovo-sr650', category: 'server', vendor: 'Lenovo',
    name: 'ThinkSystem SR650 V3', u: 2, depth: 764, power: 1100, weight: 26.4,
    price: 11900000, accent: 0xe2231a, style: 'server', bays: 16,
  },

  // ── 스토리지 ──────────────────────────────────────────
  {
    id: 'dell-me5024', category: 'storage', vendor: 'Dell',
    name: 'PowerVault ME5024', u: 2, depth: 630, power: 580, weight: 25.0,
    price: 15600000, accent: 0x2b7de9, style: 'storage', bays: 24, bayType: 'sff',
  },
  {
    id: 'syno-rs3621', category: 'storage', vendor: 'Synology',
    name: 'RackStation RS3621xs+', u: 2, depth: 692, power: 300, weight: 17.6,
    price: 5900000, accent: 0xb5b5b5, style: 'storage', bays: 12, bayType: 'lff',
  },
  {
    id: 'netapp-a250', category: 'storage', vendor: 'NetApp',
    name: 'AFF A250', u: 2, depth: 484, power: 720, weight: 22.0,
    price: 28000000, accent: 0x0077c8, style: 'storage', bays: 24, bayType: 'sff',
  },
  {
    id: 'smc-847', category: 'storage', vendor: 'Supermicro',
    name: 'SuperChassis 847 JBOD', u: 4, depth: 699, power: 900, weight: 40.0,
    price: 4200000, accent: 0x8dc63f, style: 'storage', bays: 24, bayType: 'lff',
  },

  // ── 네트워크 ──────────────────────────────────────────
  {
    id: 'cisco-c9300', category: 'network', vendor: 'Cisco',
    name: 'Catalyst 9300 48P', u: 1, depth: 445, power: 350, weight: 7.7,
    price: 9800000, accent: 0x049fd9, style: 'switch', ports: 48,
  },
  {
    id: 'arista-7050', category: 'network', vendor: 'Arista',
    name: '7050X3 48-port 25G', u: 1, depth: 460, power: 300, weight: 9.5,
    price: 21000000, accent: 0x2178c4, style: 'switch', ports: 48,
  },
  {
    id: 'juniper-ex4300', category: 'network', vendor: 'Juniper',
    name: 'EX4300-48T', u: 1, depth: 442, power: 250, weight: 8.4,
    price: 7200000, accent: 0x84b135, style: 'switch', ports: 48,
  },
  {
    id: 'mikrotik-crs354', category: 'network', vendor: 'MikroTik',
    name: 'CRS354-48G-4S+2Q+', u: 1, depth: 285, power: 63, weight: 3.4,
    price: 780000, accent: 0x5b6770, style: 'switch', ports: 48,
  },
  {
    id: 'patch-24', category: 'network', vendor: 'Generic',
    name: 'Cat6 패치패널 24포트', u: 1, depth: 100, power: 0, weight: 1.2,
    price: 45000, accent: 0x444a55, style: 'patch', ports: 24,
  },
  {
    id: 'patch-48', category: 'network', vendor: 'Generic',
    name: 'Cat6 패치패널 48포트', u: 2, depth: 100, power: 0, weight: 2.2,
    price: 85000, accent: 0x444a55, style: 'patch', ports: 48,
  },

  // ── 전원 ──────────────────────────────────────────────
  {
    id: 'apc-srt3000', category: 'power', vendor: 'APC',
    name: 'Smart-UPS SRT 3000VA', u: 2, depth: 719, power: 0, weight: 43.0,
    price: 3900000, accent: 0x1f2733, style: 'ups', capacity: 2700,
  },
  {
    id: 'eaton-9px6k', category: 'power', vendor: 'Eaton',
    name: '9PX 6000VA', u: 3, depth: 685, power: 0, weight: 60.0,
    price: 7800000, accent: 0x005baa, style: 'ups', capacity: 5400,
  },
  {
    id: 'apc-ap8853', category: 'power', vendor: 'APC',
    name: 'Metered PDU AP8853', u: 1, depth: 120, power: 0, weight: 3.0,
    price: 1200000, accent: 0x1f2733, style: 'pdu', outlets: 12,
  },

  // ── 기타 ──────────────────────────────────────────────
  {
    id: 'kvm-1u', category: 'misc', vendor: 'ATEN',
    name: 'KVM 콘솔 드로어 CL5708', u: 1, depth: 600, power: 25, weight: 12.0,
    price: 2100000, accent: 0x30353f, style: 'kvm',
  },
  {
    id: 'shelf-1u', category: 'misc', vendor: 'Generic',
    name: '고정 선반 1U', u: 1, depth: 450, power: 0, weight: 3.5,
    price: 38000, accent: 0x30353f, style: 'shelf',
  },
  {
    id: 'cable-mgr', category: 'misc', vendor: 'Generic',
    name: '케이블 정리대 1U', u: 1, depth: 90, power: 0, weight: 0.8,
    price: 22000, accent: 0x30353f, style: 'cable',
  },
  {
    id: 'blank-1u', category: 'misc', vendor: 'Generic',
    name: '블랭크 패널 1U', u: 1, depth: 20, power: 0, weight: 0.3,
    price: 8000, accent: 0x262a33, style: 'blank',
  },
  {
    id: 'blank-2u', category: 'misc', vendor: 'Generic',
    name: '블랭크 패널 2U', u: 2, depth: 20, power: 0, weight: 0.5,
    price: 14000, accent: 0x262a33, style: 'blank',
  },
];

export function getType(id) {
  return CATALOG.find((t) => t.id === id) || null;
}
