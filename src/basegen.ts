// 적 기지 절차 생성 — war-weight 기반 매칭용
import { BUILDINGS, GRID } from './data';
import { warWeight } from './state';
import type { GeneratedBase, PlacedBuilding } from './types';

const BOT_NAMES = [
  '어둠의기사', '번개도끼', '골드러시', '밤의사냥꾼', '강철주먹', '불꽃마녀', '서리거인', '초록고블린',
  '천둥군주', '검은드래곤', '숲의수호자', '바위부수기', '붉은늑대', '은빛화살', '폭풍전야', '무쇠방패',
  '달빛약탈자', '황금손', '재빠른여우', '고요한폭풍', '전장의노래', '얼음송곳니', '모래폭풍', '진홍기사',
];

const CLAN_NAMES = [
  '불멸의 전사들', '어둠의 군단', '황금 독수리', '폭풍 클랜', '강철 형제단', '붉은 방패',
  '밤의 습격자들', '용의 둥지', '천둥 부족', '서리 늑대단',
];

export function randomName(): string {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 90 + 10);
}

export function randomClanName(): string {
  return CLAN_NAMES[Math.floor(Math.random() * CLAN_NAMES.length)];
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function randInt(a: number, b: number): number {
  return Math.floor(rand(a, b + 1));
}

class Grid {
  occ = new Set<number>();
  block(x: number, y: number, size: number, pad = 0): void {
    for (let dy = -pad; dy < size + pad; dy++) for (let dx = -pad; dx < size + pad; dx++) {
      this.occ.add((y + dy) * GRID + (x + dx));
    }
  }
  free(x: number, y: number, size: number): boolean {
    if (x < 2 || y < 2 || x + size > GRID - 2 || y + size > GRID - 2) return false;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      if (this.occ.has((y + dy) * GRID + (x + dx))) return false;
    }
    return true;
  }
}

function placeNear(g: Grid, size: number, cx: number, cy: number, rMin: number, rMax: number): { x: number; y: number } | null {
  for (let t = 0; t < 250; t++) {
    const ang = rand(0, Math.PI * 2);
    const r = rand(rMin, rMax);
    const x = Math.round(cx + Math.cos(ang) * r - size / 2);
    const y = Math.round(cy + Math.sin(ang) * r - size / 2);
    if (g.free(x, y, size)) return { x, y };
  }
  // 폴백: 나선 탐색
  for (let r = 0; r < GRID; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx - Math.floor(size / 2), y = cy + dy - Math.floor(size / 2);
      if (g.free(x, y, size)) return { x, y };
    }
  }
  return null;
}

// 타운홀 레벨별 기본 약탈 가능 자원량
const BASE_LOOT = [1500, 4000, 12000, 40000, 90000, 180000, 300000, 450000, 600000, 800000];
const BASE_DARK = [0, 0, 0, 0, 0, 0, 400, 800, 1500, 2500];

export function generateBase(opts: {
  th: number;
  trophies?: number;
  lootMul?: number;
  name?: string;
  strength?: number; // 0~1: 레벨 분포 강도 (낮으면 저레벨 건물)
}): GeneratedBase {
  const th = Math.max(1, Math.min(10, opts.th));
  const strength = opts.strength ?? rand(0.5, 1);
  const g = new Grid();
  const buildings: PlacedBuilding[] = [];
  let uid = 1;
  const cx = 21, cy = 21;

  const lvFor = (id: string): number => {
    const def = BUILDINGS[id];
    const maxLv = Math.min(def.maxLvByTH[th - 1] ?? 0, def.levels.length);
    if (maxLv <= 0) return 0;
    const lo = Math.max(1, Math.round(maxLv * (strength - 0.35)));
    const hi = Math.max(1, Math.round(maxLv * Math.min(1, strength + 0.15)));
    return Math.max(1, Math.min(maxLv, randInt(lo, hi)));
  };

  const add = (id: string, x: number, y: number, lv: number): void => {
    buildings.push({ uid: uid++, id, lv, x, y });
    g.block(x, y, BUILDINGS[id].size, id === 'wall' ? 0 : 1);
  };

  // 1) 타운홀 중앙
  add('town_hall', cx - 2, cy - 2, th);

  // 2) 코어: 저장고류
  const coreIds: string[] = [];
  for (const id of ['gold_storage', 'elixir_storage', 'dark_storage']) {
    const n = BUILDINGS[id].countByTH[th - 1] ?? 0;
    for (let i = 0; i < n; i++) coreIds.push(id);
  }
  for (const id of coreIds) {
    const p = placeNear(g, BUILDINGS[id].size, cx, cy, 3, 6);
    if (p) add(id, p.x, p.y, lvFor(id));
  }

  // 3) 방어 시설: 코어 주변
  const defIds: string[] = [];
  for (const id of ['cannon', 'archer_tower', 'mortar', 'air_defense', 'wizard_tower', 'hidden_tesla']) {
    const n = BUILDINGS[id].countByTH[th - 1] ?? 0;
    for (let i = 0; i < n; i++) defIds.push(id);
  }
  for (const id of defIds) {
    const p = placeNear(g, BUILDINGS[id].size, cx, cy, 5, 10);
    if (p) add(id, p.x, p.y, lvFor(id));
  }

  // 4) 성벽 링 (1~2겹)
  const wallDef = BUILDINGS.wall;
  let wallsLeft = wallDef.countByTH[th - 1] ?? 0;
  const wallLv = lvFor('wall');
  const rings = th >= 5 ? [7, 11] : [7];
  for (const half of rings) {
    for (let dy = -half; dy <= half && wallsLeft > 0; dy++) {
      for (let dx = -half; dx <= half && wallsLeft > 0; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== half) continue;
        const x = cx + dx, y = cy + dy;
        if (!g.free(x, y, 1)) continue;
        // 무작위 틈 (공략 가능하게)
        if (Math.random() < 0.04) continue;
        add('wall', x, y, wallLv);
        wallsLeft--;
      }
    }
  }

  // 5) 함정: 성벽 안쪽에 흩뿌림
  for (const id of ['bomb', 'spring_trap', 'giant_bomb', 'air_bomb']) {
    const n = BUILDINGS[id].countByTH[th - 1] ?? 0;
    for (let i = 0; i < n; i++) {
      const p = placeNear(g, BUILDINGS[id].size, cx, cy, 3, 10);
      if (p) add(id, p.x, p.y, lvFor(id));
    }
  }

  // 6) 외곽: 자원/군사 건물
  const outerIds: string[] = [];
  for (const id of ['gold_mine', 'elixir_collector', 'dark_drill', 'barracks', 'dark_barracks', 'army_camp', 'laboratory', 'spell_factory', 'builder_hut']) {
    const n = BUILDINGS[id].countByTH[th - 1] ?? 0;
    for (let i = 0; i < n; i++) outerIds.push(id);
  }
  for (const id of outerIds) {
    const p = placeNear(g, BUILDINGS[id].size, cx, cy, 12, 17);
    if (p) add(id, p.x, p.y, lvFor(id));
  }

  const lootMul = opts.lootMul ?? 1;
  const loot = {
    gold: Math.floor(BASE_LOOT[th - 1] * rand(0.4, 1.6) * lootMul),
    elixir: Math.floor(BASE_LOOT[th - 1] * rand(0.4, 1.6) * lootMul),
    dark: Math.floor(BASE_DARK[th - 1] * rand(0.3, 1.5) * lootMul),
  };

  return {
    name: opts.name ?? randomName(),
    th,
    weight: warWeight(buildings),
    trophies: Math.max(0, Math.round((opts.trophies ?? 100) + rand(-40, 40))),
    buildings,
    loot,
  };
}

// 트로피 기반 매칭 상대 생성 (약탈전)
export function generateOpponent(myTH: number, myTrophies: number): GeneratedBase {
  // 트로피가 높을수록 상대 TH도 높아짐
  const thShift = Math.random() < 0.3 ? -1 : Math.random() < 0.2 ? 1 : 0;
  const th = Math.max(1, Math.min(10, myTH + thShift));
  return generateBase({ th, trophies: myTrophies, strength: rand(0.45, 0.95) });
}
