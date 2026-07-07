// 게임 상태 생성/저장/불러오기 + 그리드 헬퍼
import { BUILDINGS, GRID, TROOPS, SPELLS } from './data';
import type { GameState, PlacedBuilding, Obstacle } from './types';

export const SAVE_KEY = 'solo-clash-save-v1';

// ---- IndexedDB (localStorage 폴백) ----
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('solo-clash', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveState(state: GameState): Promise<void> {
  state.lastSeen = Date.now();
  const data = JSON.stringify(state);
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(data, SAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try { localStorage.setItem(SAVE_KEY, data); } catch { /* 저장 불가 */ }
  }
}

export async function loadState(): Promise<GameState | null> {
  let raw: string | null = null;
  try {
    const db = await openDB();
    raw = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(SAVE_KEY);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch { /* IndexedDB 실패 → localStorage */ }
  if (!raw) {
    try { raw = localStorage.getItem(SAVE_KEY); } catch { raw = null; }
  }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (typeof s.v !== 'number' || !Array.isArray(s.buildings)) return null;
    return s;
  } catch {
    return null;
  }
}

// ---- 그리드 ----
export function cellKey(x: number, y: number): number {
  return y * GRID + x;
}

export function occupiedCells(state: Pick<GameState, 'buildings' | 'obstacles'>, ignoreUid?: number): Set<number> {
  const occ = new Set<number>();
  for (const b of state.buildings) {
    if (b.uid === ignoreUid) continue;
    const size = BUILDINGS[b.id].size;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) occ.add(cellKey(b.x + dx, b.y + dy));
  }
  for (const o of state.obstacles) {
    if (o.uid === ignoreUid) continue;
    const size = o.kind >= 4 ? 2 : 1; // 바위 2x2, 나무 1x1
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) occ.add(cellKey(o.x + dx, o.y + dy));
  }
  return occ;
}

export function canPlaceAt(occ: Set<number>, size: number, x: number, y: number): boolean {
  if (x < 1 || y < 1 || x + size > GRID - 1 || y + size > GRID - 1) return false;
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
    if (occ.has(cellKey(x + dx, y + dy))) return false;
  }
  return true;
}

export function findFreeSpot(state: GameState, size: number): { x: number; y: number } | null {
  const occ = occupiedCells(state);
  const c = Math.floor(GRID / 2) - Math.floor(size / 2);
  for (let r = 0; r < GRID; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = c + dx, y = c + dy;
        if (canPlaceAt(occ, size, x, y)) return { x, y };
      }
    }
  }
  return null;
}

// ---- 새 게임 ----
export function newGame(): GameState {
  const now = Date.now();
  let uid = 1;
  const b = (id: string, lv: number, x: number, y: number): PlacedBuilding => ({ uid: uid++, id, lv, x, y, lastCollect: now });
  const buildings: PlacedBuilding[] = [
    b('town_hall', 1, 20, 20),
    b('gold_mine', 1, 16, 24),
    b('elixir_collector', 1, 25, 24),
    b('gold_storage', 1, 17, 16),
    b('elixir_storage', 1, 24, 16),
    b('cannon', 1, 21, 25),
    b('builder_hut', 1, 14, 19),
    b('builder_hut', 1, 28, 19),
  ];
  const obstacles: Obstacle[] = [];
  const occ = occupiedCells({ buildings, obstacles });
  let tries = 0;
  while (obstacles.length < 14 && tries < 500) {
    tries++;
    const kind = Math.floor(Math.random() * 6);
    const size = kind >= 4 ? 2 : 1;
    const x = 2 + Math.floor(Math.random() * (GRID - 4 - size));
    const y = 2 + Math.floor(Math.random() * (GRID - 4 - size));
    // 중앙 마을 주변은 피함
    if (x > 10 && x < 32 && y > 12 && y < 30) continue;
    if (!canPlaceAt(occ, size, x, y)) continue;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) occ.add(cellKey(x + dx, y + dy));
    obstacles.push({ uid: uid++, kind, x, y });
  }
  return {
    v: 1,
    created: now,
    lastSeen: now,
    name: '족장',
    gold: 1000,
    elixir: 1000,
    dark: 0,
    gems: 500,
    trophies: 0,
    shieldUntil: now + 12 * 3600 * 1000, // 시작 실드 (원작: 3일이지만 싱글이라 12시간)
    nextUid: uid,
    buildings,
    obstacles,
    army: {},
    spells: {},
    trainQ: [],
    spellQ: [],
    research: {},
    labUntil: 0,
    labItem: null,
    log: [],
    war: null,
    warsWon: 0,
    warsLost: 0,
    attacksWon: 0,
    achieved: {},
    lastObstacleSpawn: now,
    lastRaidCheck: now,
    settings: { fastWar: false },
  };
}

// ---- 파생 값 ----
export function thLevel(state: GameState): number {
  const th = state.buildings.find((x) => x.id === 'town_hall');
  return th ? Math.max(1, th.lv) : 1;
}

export function builderTotal(state: GameState): number {
  return state.buildings.filter((x) => x.id === 'builder_hut').length;
}

export function buildersBusy(state: GameState): number {
  const now = Date.now();
  let n = state.buildings.filter((x) => x.upEnd && x.upEnd > now).length;
  n += state.obstacles.filter((o) => o.clearEnd && o.clearEnd > now).length;
  return n;
}

export function buildersFree(state: GameState): number {
  return builderTotal(state) - buildersBusy(state);
}

export function storageCap(state: GameState, res: 'gold' | 'elixir' | 'dark'): number {
  let cap = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.id];
    if (b.lv < 1) continue;
    if (def.cat === 'storage' && def.resType === res) cap += def.levels[b.lv - 1].cap ?? 0;
    if (def.cat === 'th' && res !== 'dark') cap += 1000 * b.lv; // 타운홀 자체 저장량
  }
  return cap;
}

export function armyCapacity(state: GameState): number {
  let cap = 0;
  for (const b of state.buildings) {
    if (b.id === 'army_camp' && b.lv >= 1) cap += BUILDINGS.army_camp.levels[b.lv - 1].cap ?? 0;
  }
  return cap;
}

export function armyUsed(state: GameState): number {
  let used = 0;
  for (const [id, n] of Object.entries(state.army)) used += n * (TROOPS[id]?.housing ?? 0);
  return used;
}

export function spellCapacity(state: GameState): number {
  const f = state.buildings.find((b) => b.id === 'spell_factory' && b.lv >= 1);
  if (!f) return 0;
  return BUILDINGS.spell_factory.levels[f.lv - 1].cap ?? 0;
}

export function spellsUsed(state: GameState): number {
  let used = 0;
  for (const [id, n] of Object.entries(state.spells)) used += n * (SPELLS[id]?.housing ?? 1);
  return used;
}

export function troopLevel(state: GameState, id: string): number {
  return state.research[id] ?? 1;
}

// 최고 레벨 훈련소 (일반/다크)
export function maxBarracksLevel(state: GameState, kind: 'barracks' | 'dark_barracks'): number {
  let max = 0;
  for (const b of state.buildings) if (b.id === kind && b.lv > max) max = b.lv;
  return max;
}

// 전쟁 무게 (기지 전력 수치화 — 매칭용)
export function warWeight(buildings: PlacedBuilding[]): number {
  let w = 0;
  for (const b of buildings) {
    const def = BUILDINGS[b.id];
    if (!def || b.lv < 1) continue;
    w += def.weightFactor * b.lv;
  }
  return Math.round(w);
}
