// 경제/진행 로직: 자원, 건설, 훈련, 연구, 장애물, 업적
import {
  BUILDINGS, TROOPS, SPELLS, BUILDER_HUT_GEM_COST, OBSTACLE_GEMS,
  STORAGE_LOOT_PCT, STORAGE_LOOT_CAP, COLLECTOR_LOOT_PCT, DARK_LOOT_PCT, DARK_LOOT_CAP, TH_LOOT,
} from './data';
import type { GameState, PlacedBuilding, Res } from './types';
import {
  thLevel, buildersFree, storageCap, armyCapacity, armyUsed, spellCapacity, spellsUsed,
  maxBarracksLevel, occupiedCells, canPlaceAt,
} from './state';

export type EcoEvent = { type: 'toast'; msg: string } | { type: 'achievement'; msg: string; gems: number };

// ---- 자원 ----
export function getRes(state: GameState, res: Res): number {
  if (res === 'gold') return state.gold;
  if (res === 'elixir') return state.elixir;
  if (res === 'dark') return state.dark;
  return state.gems;
}

export function addRes(state: GameState, res: Res, amount: number): void {
  if (res === 'gems') { state.gems += amount; return; }
  const cap = storageCap(state, res);
  if (res === 'gold') state.gold = Math.max(0, Math.min(cap, state.gold + amount));
  else if (res === 'elixir') state.elixir = Math.max(0, Math.min(cap, state.elixir + amount));
  else state.dark = Math.max(0, Math.min(cap, state.dark + amount));
}

export function canAfford(state: GameState, res: Res, amount: number): boolean {
  return getRes(state, res) >= amount;
}

export function spendRes(state: GameState, res: Res, amount: number): boolean {
  if (!canAfford(state, res, amount)) return false;
  if (res === 'gold') state.gold -= amount;
  else if (res === 'elixir') state.elixir -= amount;
  else if (res === 'dark') state.dark -= amount;
  else state.gems -= amount;
  return true;
}

// ---- 수집기 ----
export function collectorStored(b: PlacedBuilding, now: number): number {
  const def = BUILDINGS[b.id];
  if (def.cat !== 'resource' || b.lv < 1) return 0;
  const level = def.levels[b.lv - 1];
  const elapsed = Math.max(0, now - (b.lastCollect ?? now));
  return Math.min(level.cap ?? 0, ((level.prod ?? 0) * elapsed) / 3600000);
}

export function collect(state: GameState, uid: number): number {
  const b = state.buildings.find((x) => x.uid === uid);
  if (!b) return 0;
  const def = BUILDINGS[b.id];
  if (def.cat !== 'resource' || !def.resType) return 0;
  const now = Date.now();
  const amount = Math.floor(collectorStored(b, now));
  if (amount <= 0) return 0;
  const before = getRes(state, def.resType);
  addRes(state, def.resType, amount);
  const gained = getRes(state, def.resType) - before;
  b.lastCollect = now;
  return gained;
}

// ---- 건설/업그레이드 ----
export function buildingCount(state: GameState, id: string): number {
  return state.buildings.filter((b) => b.id === id).length;
}

export function nextBuildCost(state: GameState, id: string): { res: Res; cost: number } {
  const def = BUILDINGS[id];
  if (id === 'builder_hut') {
    const n = buildingCount(state, id); // 다음이 n+1번째
    return { res: 'gems', cost: BUILDER_HUT_GEM_COST[n] ?? 99999 };
  }
  return { res: def.costRes, cost: def.levels[0].cost };
}

export function canBuyBuilding(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = BUILDINGS[id];
  const th = thLevel(state);
  const max = def.countByTH[th - 1] ?? 0;
  if (buildingCount(state, id) >= max) return { ok: false, reason: max === 0 ? '타운홀 레벨이 부족합니다' : '최대 보유 수에 도달했습니다' };
  const { res, cost } = nextBuildCost(state, id);
  if (!canAfford(state, res, cost)) return { ok: false, reason: '자원이 부족합니다' };
  const needsBuilder = def.levels[0].time > 0;
  if (needsBuilder && buildersFree(state) <= 0) return { ok: false, reason: '건설업자가 없습니다' };
  return { ok: true };
}

export function placeBuilding(state: GameState, id: string, x: number, y: number): boolean {
  const check = canBuyBuilding(state, id);
  if (!check.ok) return false;
  const def = BUILDINGS[id];
  const occ = occupiedCells(state);
  if (!canPlaceAt(occ, def.size, x, y)) return false;
  const { res, cost } = nextBuildCost(state, id);
  if (!spendRes(state, res, cost)) return false;
  const now = Date.now();
  const time = def.levels[0].time;
  const b: PlacedBuilding = {
    uid: state.nextUid++, id, lv: time > 0 ? 0 : 1, x, y,
    lastCollect: now,
  };
  if (time > 0) b.upEnd = now + time * 1000;
  state.buildings.push(b);
  return true;
}

export function canUpgrade(state: GameState, b: PlacedBuilding): { ok: boolean; reason?: string } {
  const def = BUILDINGS[b.id];
  if (b.lv < 1 || (b.upEnd && b.upEnd > Date.now())) return { ok: false, reason: '작업이 진행 중입니다' };
  const th = thLevel(state);
  const maxLv = def.maxLvByTH[th - 1] ?? 0;
  if (b.lv >= def.levels.length) return { ok: false, reason: '최대 레벨입니다' };
  if (b.lv >= maxLv) return { ok: false, reason: '타운홀 업그레이드가 필요합니다' };
  const next = def.levels[b.lv];
  if (!canAfford(state, def.costRes, next.cost)) return { ok: false, reason: '자원이 부족합니다' };
  if (next.time > 0 && buildersFree(state) <= 0) return { ok: false, reason: '건설업자가 없습니다' };
  return { ok: true };
}

export function startUpgrade(state: GameState, uid: number): boolean {
  const b = state.buildings.find((x) => x.uid === uid);
  if (!b) return false;
  const def = BUILDINGS[b.id];
  const check = canUpgrade(state, b);
  if (!check.ok) return false;
  const next = def.levels[b.lv];
  if (!spendRes(state, def.costRes, next.cost)) return false;
  if (next.time <= 0) {
    // 성벽 등 즉시 완료
    if (def.cat === 'resource') collect(state, uid);
    b.lv++;
    return true;
  }
  if (def.cat === 'resource') collect(state, uid); // 업그레이드 전 자동 수확
  b.upEnd = Date.now() + next.time * 1000;
  return true;
}

export function finishBuildingWithGems(state: GameState, uid: number, gemCost: number): boolean {
  const b = state.buildings.find((x) => x.uid === uid);
  if (!b || !b.upEnd) return false;
  if (!spendRes(state, 'gems', gemCost)) return false;
  b.upEnd = Date.now() - 1;
  return true;
}

// ---- 장애물 ----
export function obstacleClearCost(kind: number): { res: Res; cost: number; time: number } {
  if (kind >= 4) return { res: 'gold', cost: 250, time: 60 }; // 바위
  return { res: 'elixir', cost: 100, time: 30 }; // 나무
}

export function clearObstacle(state: GameState, uid: number): boolean {
  const o = state.obstacles.find((x) => x.uid === uid);
  if (!o || o.clearEnd) return false;
  if (buildersFree(state) <= 0) return false;
  const { res, cost, time } = obstacleClearCost(o.kind);
  if (!spendRes(state, res, cost)) return false;
  o.clearEnd = Date.now() + time * 1000;
  return true;
}

// ---- 훈련 ----
export function troopUnlocked(state: GameState, id: string): boolean {
  const def = TROOPS[id];
  return maxBarracksLevel(state, def.barracks) >= def.unlockLv;
}

export function queuedHousing(state: GameState): number {
  let h = 0;
  for (const q of state.trainQ) h += TROOPS[q.id]?.housing ?? 0;
  return h;
}

export function trainTroop(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = TROOPS[id];
  if (!def) return { ok: false, reason: '알 수 없는 유닛' };
  if (!troopUnlocked(state, id)) return { ok: false, reason: '훈련소 레벨이 부족합니다' };
  if (armyUsed(state) + queuedHousing(state) + def.housing > armyCapacity(state)) {
    return { ok: false, reason: '군대 캠프가 가득 찼습니다' };
  }
  const lvl = state.research[id] ?? 1;
  const cost = def.cost[lvl - 1];
  if (!spendRes(state, def.costRes, cost)) return { ok: false, reason: '자원이 부족합니다' };
  state.trainQ.push({ id, rem: def.trainTime });
  return { ok: true };
}

export function cancelTrain(state: GameState, index: number): void {
  const q = state.trainQ[index];
  if (!q) return;
  const def = TROOPS[q.id];
  const lvl = state.research[q.id] ?? 1;
  addRes(state, def.costRes, def.cost[lvl - 1]); // 전액 환불 (원작 규칙)
  state.trainQ.splice(index, 1);
}

export function brewSpell(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = SPELLS[id];
  if (!def) return { ok: false, reason: '알 수 없는 주문' };
  const factory = state.buildings.find((b) => b.id === 'spell_factory' && b.lv >= def.unlockLv);
  if (!factory) return { ok: false, reason: '주문 공장 레벨이 부족합니다' };
  let queued = 0;
  for (const q of state.spellQ) queued += SPELLS[q.id]?.housing ?? 1;
  if (spellsUsed(state) + queued + def.housing > spellCapacity(state)) {
    return { ok: false, reason: '주문 보관함이 가득 찼습니다' };
  }
  const lvl = state.research[id] ?? 1;
  if (!spendRes(state, 'elixir', def.cost[lvl - 1])) return { ok: false, reason: '엘릭서가 부족합니다' };
  state.spellQ.push({ id, rem: def.brewTime });
  return { ok: true };
}

// ---- 연구소 ----
export function labLevel(state: GameState): number {
  const lab = state.buildings.find((b) => b.id === 'laboratory' && b.lv >= 1);
  return lab ? lab.lv : 0;
}

export function canResearch(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = (TROOPS[id] as import('./types').TroopDef | undefined) ?? (SPELLS[id] as import('./types').SpellDef | undefined);
  if (!def) return { ok: false, reason: '알 수 없는 항목' };
  if (state.labItem) return { ok: false, reason: '연구소가 사용 중입니다' };
  const cur = state.research[id] ?? 1;
  const maxLv = ('dps' in def ? def.dps.length : def.power.length);
  if (cur >= maxLv) return { ok: false, reason: '최대 레벨입니다' };
  const step = def.research[cur - 1];
  if (!step) return { ok: false, reason: '최대 레벨입니다' };
  if (labLevel(state) < step.lab) return { ok: false, reason: `연구소 ${step.lab}레벨 필요` };
  const res: Res = 'researchRes' in def ? def.researchRes : 'elixir';
  if (!canAfford(state, res, step.cost)) return { ok: false, reason: '자원이 부족합니다' };
  return { ok: true };
}

export function startResearch(state: GameState, id: string): boolean {
  const check = canResearch(state, id);
  if (!check.ok) return false;
  const def = (TROOPS[id] as import('./types').TroopDef | undefined) ?? SPELLS[id];
  const cur = state.research[id] ?? 1;
  const step = def.research[cur - 1];
  const res: Res = 'researchRes' in def ? def.researchRes : 'elixir';
  if (!spendRes(state, res, step.cost)) return false;
  state.labItem = id;
  state.labUntil = Date.now() + step.time * 1000;
  return true;
}

// ---- 틱 (실시간 + 오프라인 경과 공용) ----
export function economyTick(state: GameState, dtSec: number): EcoEvent[] {
  const events: EcoEvent[] = [];
  const now = Date.now();

  // 건설/업그레이드 완료
  for (const b of state.buildings) {
    if (b.upEnd && b.upEnd <= now) {
      b.upEnd = undefined;
      if (b.lv < 1) b.lv = 1;
      else b.lv++;
      if (BUILDINGS[b.id].cat === 'resource') b.lastCollect = now;
      events.push({ type: 'toast', msg: `${BUILDINGS[b.id].name} 레벨 ${b.lv} 완성!` });
    }
  }

  // 장애물 제거 완료
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const o = state.obstacles[i];
    if (o.clearEnd && o.clearEnd <= now) {
      state.obstacles.splice(i, 1);
      const idx = (state.achieved['_obstacleGemIdx'] ?? 0) % OBSTACLE_GEMS.length;
      const gems = OBSTACLE_GEMS[idx];
      state.achieved['_obstacleGemIdx'] = idx + 1;
      state.achieved['_obstacleCount'] = (state.achieved['_obstacleCount'] ?? 0) + 1;
      if (gems > 0) {
        state.gems += gems;
        events.push({ type: 'toast', msg: `장애물 제거 — 젬 ${gems}개 발견!` });
      }
    }
  }

  // 장애물 자연 생성 (8시간마다, 최대 30개)
  const SPAWN_MS = 8 * 3600 * 1000;
  while (now - state.lastObstacleSpawn > SPAWN_MS) {
    state.lastObstacleSpawn += SPAWN_MS;
    if (state.obstacles.length >= 30) continue;
    const occ = occupiedCells(state);
    for (let tries = 0; tries < 60; tries++) {
      const kind = Math.floor(Math.random() * 6);
      const size = kind >= 4 ? 2 : 1;
      const x = 2 + Math.floor(Math.random() * (40 - size));
      const y = 2 + Math.floor(Math.random() * (40 - size));
      if (canPlaceAt(occ, size, x, y)) {
        state.obstacles.push({ uid: state.nextUid++, kind, x, y });
        break;
      }
    }
  }

  // 훈련 진행 — 훈련소 수만큼 병렬 헤드
  const heads = { barracks: Math.max(0, buildingCount(state, 'barracks')), dark_barracks: Math.max(0, buildingCount(state, 'dark_barracks')) };
  for (const kind of ['barracks', 'dark_barracks'] as const) {
    let remainingDt = dtSec;
    // 오프라인 경과를 위해 완료 반복 처리
    let guard = 0;
    while (remainingDt > 0 && guard++ < 1000) {
      const active = state.trainQ.filter((q) => TROOPS[q.id].barracks === kind).slice(0, heads[kind]);
      if (active.length === 0) break;
      const minRem = Math.min(...active.map((q) => q.rem));
      const step = Math.min(remainingDt, Math.max(0.01, minRem));
      for (const q of active) q.rem -= step;
      remainingDt -= step;
      // 완료 항목 군대로 이동 (공간 있을 때만)
      for (let i = 0; i < state.trainQ.length; i++) {
        const q = state.trainQ[i];
        if (TROOPS[q.id].barracks !== kind || q.rem > 0) continue;
        const def = TROOPS[q.id];
        if (armyUsed(state) + def.housing <= armyCapacity(state)) {
          state.army[q.id] = (state.army[q.id] ?? 0) + 1;
          state.trainQ.splice(i, 1);
          i--;
        } else {
          q.rem = 0; // 공간 없음 — 대기 (헤드 점유)
          remainingDt = 0;
        }
      }
    }
  }

  // 주문 제조 (헤드 1개)
  {
    let remainingDt = dtSec;
    let guard = 0;
    while (remainingDt > 0 && guard++ < 100 && state.spellQ.length > 0) {
      const q = state.spellQ[0];
      const step = Math.min(remainingDt, Math.max(0.01, q.rem));
      q.rem -= step;
      remainingDt -= step;
      if (q.rem <= 0) {
        const def = SPELLS[q.id];
        let used = spellsUsed(state);
        if (used + def.housing <= spellCapacity(state)) {
          state.spells[q.id] = (state.spells[q.id] ?? 0) + 1;
          state.spellQ.shift();
        } else {
          q.rem = 0;
          break;
        }
      }
    }
  }

  // 연구 완료
  if (state.labItem && state.labUntil <= now) {
    const id = state.labItem;
    state.research[id] = (state.research[id] ?? 1) + 1;
    const name = TROOPS[id]?.name ?? SPELLS[id]?.name ?? id;
    events.push({ type: 'toast', msg: `연구 완료: ${name} 레벨 ${state.research[id]}` });
    state.labItem = null;
    state.labUntil = 0;
  }

  events.push(...checkAchievements(state));
  return events;
}

// ---- 약탈 가능 자원 계산 (내 마을 기준 — 방어 시뮬용) ----
export function lootAvailable(state: GameState, attackerTH: number): { gold: number; elixir: number; dark: number } {
  const th = thLevel(state);
  const mul = 1; // 방어 시 공격자 배수는 defense.ts에서 처리
  const now = Date.now();
  let cGold = 0, cElixir = 0, cDark = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.id];
    if (def.cat === 'resource' && def.resType && b.lv >= 1) {
      const stored = collectorStored(b, now);
      if (def.resType === 'gold') cGold += stored;
      else if (def.resType === 'elixir') cElixir += stored;
      else cDark += stored;
    }
  }
  const capIdx = Math.min(th, 10) - 1;
  const gold = Math.min(state.gold * STORAGE_LOOT_PCT, STORAGE_LOOT_CAP[capIdx]) + cGold * COLLECTOR_LOOT_PCT + TH_LOOT * mul;
  const elixir = Math.min(state.elixir * STORAGE_LOOT_PCT, STORAGE_LOOT_CAP[capIdx]) + cElixir * COLLECTOR_LOOT_PCT + TH_LOOT * mul;
  const dark = Math.min(state.dark * DARK_LOOT_PCT, DARK_LOOT_CAP[capIdx]) + cDark * COLLECTOR_LOOT_PCT;
  return { gold: Math.floor(gold), elixir: Math.floor(elixir), dark: Math.floor(dark) };
}

// ---- 업적 ----
export interface AchievementDef {
  id: string;
  name: string;
  tiers: { goal: number; gems: number }[];
  metric: (s: GameState) => number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'conqueror', name: '정복자',
    tiers: [{ goal: 10, gems: 50 }, { goal: 50, gems: 150 }, { goal: 200, gems: 500 }],
    metric: (s) => s.attacksWon,
  },
  {
    id: 'trophy_hunter', name: '트로피 사냥꾼',
    tiers: [{ goal: 200, gems: 100 }, { goal: 450, gems: 250 }, { goal: 1250, gems: 450 }],
    metric: (s) => s.trophies,
  },
  {
    id: 'village_growth', name: '마을의 성장',
    tiers: [{ goal: 3, gems: 50 }, { goal: 5, gems: 200 }, { goal: 8, gems: 1000 }],
    metric: (s) => thLevel(s),
  },
  {
    id: 'war_hero', name: '전쟁 영웅',
    tiers: [{ goal: 1, gems: 100 }, { goal: 5, gems: 300 }, { goal: 25, gems: 1000 }],
    metric: (s) => s.warsWon,
  },
  {
    id: 'gardener', name: '정원사',
    tiers: [{ goal: 5, gems: 10 }, { goal: 50, gems: 50 }, { goal: 500, gems: 100 }],
    metric: (s) => s.achieved['_obstacleCount'] ?? 0,
  },
];

function checkAchievements(state: GameState): EcoEvent[] {
  const events: EcoEvent[] = [];
  for (const a of ACHIEVEMENTS) {
    const claimed = state.achieved[a.id] ?? 0;
    const value = a.metric(state);
    let newClaimed = claimed;
    for (let t = claimed; t < a.tiers.length; t++) {
      if (value >= a.tiers[t].goal) {
        state.gems += a.tiers[t].gems;
        events.push({ type: 'achievement', msg: `업적 달성: ${a.name} (${t + 1}단계)`, gems: a.tiers[t].gems });
        newClaimed = t + 1;
      } else break;
    }
    state.achieved[a.id] = newClaimed;
  }
  return events;
}
