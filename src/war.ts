// 클랜전 — 5 vs 5, 멤버당 공격 2회. 아군 4명 + 상대 5명은 AI로 시뮬레이션
// 매칭은 원작 규칙대로 트로피가 아닌 전력(war weight) 기반
import { WAR_BONUS_GOLD } from './data';
import { thLevel, warWeight } from './state';
import { addRes, type EcoEvent } from './economy';
import { generateBase, randomName, randomClanName } from './basegen';
import type { GameState, WarMember, WarState, GeneratedBase } from './types';

const WAR_SIZE = 5;
export const ATTACKS_PER_MEMBER = 2;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function makeAIMember(refTH: number, refWeight: number): WarMember {
  const th = Math.max(1, Math.min(10, refTH + (Math.random() < 0.3 ? -1 : Math.random() < 0.15 ? 1 : 0)));
  return {
    name: randomName(),
    th,
    weight: Math.round(refWeight * rand(0.7, 1.15)),
    stars: 0,
    bestDestruction: 0,
    attacksUsed: 0,
  };
}

export function startWar(state: GameState, fast: boolean): WarState {
  const now = Date.now();
  const myTH = thLevel(state);
  const myWeight = warWeight(state.buildings);

  const prepMs = fast ? 10 * 60 * 1000 : 23 * 3600 * 1000;
  const battleMs = fast ? 2 * 3600 * 1000 : 24 * 3600 * 1000;
  const prepEnd = now + prepMs;
  const battleEnd = prepEnd + battleMs;

  const myClan: WarMember[] = [
    { name: state.name, th: myTH, weight: myWeight, stars: 0, bestDestruction: 0, attacksUsed: 0, isPlayer: true },
  ];
  for (let i = 1; i < WAR_SIZE; i++) myClan.push(makeAIMember(myTH, myWeight));
  const enemyClan: WarMember[] = [];
  for (let i = 0; i < WAR_SIZE; i++) enemyClan.push(makeAIMember(myTH, myWeight));
  // 전력 순 정렬 (강한 순번이 위)
  myClan.sort((a, b) => b.weight - a.weight);
  enemyClan.sort((a, b) => b.weight - a.weight);

  // AI 공격 스케줄 (전쟁일 내 무작위 시각)
  const schedule: WarState['schedule'] = [];
  myClan.forEach((m, idx) => {
    if (m.isPlayer) return;
    for (let a = 0; a < ATTACKS_PER_MEMBER; a++) {
      schedule.push({ ts: prepEnd + battleMs * rand(0.08, 0.95), side: 'my', attackerIdx: idx, defenderIdx: -1, done: false });
    }
  });
  enemyClan.forEach((_, idx) => {
    for (let a = 0; a < ATTACKS_PER_MEMBER; a++) {
      schedule.push({ ts: prepEnd + battleMs * rand(0.08, 0.95), side: 'enemy', attackerIdx: idx, defenderIdx: -1, done: false });
    }
  });
  schedule.sort((a, b) => a.ts - b.ts);

  return {
    phase: 'prep',
    prepEnd,
    battleEnd,
    enemyClanName: randomClanName(),
    myClan,
    enemyClan,
    schedule,
    log: [],
  };
}

// 적 멤버 기지 (최초 조회 시 생성 후 캐시 — 정찰/공격 일관성)
export function warBaseFor(war: WarState, memberIdx: number): GeneratedBase {
  const m = war.enemyClan[memberIdx];
  if (!m.base) {
    m.base = generateBase({
      th: m.th,
      name: m.name,
      trophies: 0,
      lootMul: 0, // 전쟁 기지엔 약탈물 없음 — 보상은 전쟁 보너스로
      strength: Math.max(0.4, Math.min(1, m.weight / Math.max(1, war.myClan[0].weight))),
    });
  }
  return m.base;
}

function simulateAIAttack(attWeight: number, defWeight: number): { stars: number; destruction: number } {
  const ratio = attWeight / Math.max(1, defWeight);
  let destruction = Math.round(38 + 50 * (ratio - 0.85) + rand(-25, 28));
  destruction = Math.max(4, Math.min(100, destruction));
  let stars = 0;
  if (destruction >= 100) stars = 3;
  else {
    if (destruction >= 50) stars++;
    if (Math.random() < 0.28 + 0.35 * (ratio - 0.8)) stars++;
  }
  return { stars: Math.min(3, stars), destruction };
}

// AI가 공격할 대상 선택: 별 3개가 아닌 기지 중 가장 강한(순번 낮은) 기지 위주
function pickDefender(defenders: WarMember[]): number {
  const open = defenders.map((m, i) => ({ m, i })).filter((x) => x.m.stars < 3);
  if (open.length === 0) return Math.floor(Math.random() * defenders.length);
  // 약간의 무작위성을 두고 상위 기지 선호
  const sorted = open.sort((a, b) => b.m.weight - a.m.weight);
  const pick = Math.random() < 0.6 ? 0 : Math.floor(Math.random() * sorted.length);
  return sorted[pick].i;
}

export function warStars(members: WarMember[]): number {
  return members.reduce((s, m) => s + m.stars, 0);
}

export function warDestruction(members: WarMember[]): number {
  return members.reduce((s, m) => s + m.bestDestruction, 0) / members.length;
}

// 시간 경과 처리: 페이즈 전환 + 예정된 AI 공격 실행
export function warTick(state: GameState): EcoEvent[] {
  const events: EcoEvent[] = [];
  const war = state.war;
  if (!war || war.phase === 'ended') return events;
  const now = Date.now();

  if (war.phase === 'prep' && now >= war.prepEnd) {
    war.phase = 'battle';
    events.push({ type: 'toast', msg: '클랜전 전쟁일이 시작되었습니다!' });
  }

  if (war.phase === 'battle') {
    for (const s of war.schedule) {
      if (s.done || s.ts > now) continue;
      s.done = true;
      const attackers = s.side === 'my' ? war.myClan : war.enemyClan;
      const defenders = s.side === 'my' ? war.enemyClan : war.myClan;
      const attacker = attackers[s.attackerIdx];
      if (!attacker || attacker.isPlayer) continue;
      const dIdx = pickDefender(defenders);
      const defender = defenders[dIdx];
      attacker.attacksUsed++;
      const r = simulateAIAttack(attacker.weight, defender.weight);
      const newStars = Math.max(0, r.stars - defender.stars);
      defender.stars = Math.max(defender.stars, r.stars);
      defender.bestDestruction = Math.max(defender.bestDestruction, r.destruction);
      war.log.unshift({
        ts: s.ts,
        attacker: attacker.name,
        defender: defender.name,
        stars: newStars,
        totalStars: r.stars,
        destruction: r.destruction,
        enemySide: s.side === 'enemy',
      });
    }
    war.log = war.log.slice(0, 50);

    if (now >= war.battleEnd) {
      endWar(state, events);
    }
  }
  return events;
}

// 플레이어의 전쟁 공격 결과 반영
export function applyWarAttack(state: GameState, memberIdx: number, stars: number, destruction: number): void {
  const war = state.war;
  if (!war) return;
  const me = war.myClan.find((m) => m.isPlayer);
  if (me) me.attacksUsed++;
  const defender = war.enemyClan[memberIdx];
  const newStars = Math.max(0, stars - defender.stars);
  defender.stars = Math.max(defender.stars, stars);
  defender.bestDestruction = Math.max(defender.bestDestruction, destruction);
  war.log.unshift({
    ts: Date.now(),
    attacker: state.name,
    defender: defender.name,
    stars: newStars,
    totalStars: stars,
    destruction,
    enemySide: false,
  });
}

export function playerAttacksLeft(war: WarState): number {
  const me = war.myClan.find((m) => m.isPlayer);
  return me ? ATTACKS_PER_MEMBER - me.attacksUsed : 0;
}

function endWar(state: GameState, events: EcoEvent[]): void {
  const war = state.war!;
  war.phase = 'ended';
  const enemyStars = warStars(war.myClan);
  const myS = warStars(war.enemyClan); // 내가 딴 별 = 적 기지에 붙은 별
  const myD = warDestruction(war.enemyClan);
  const enD = warDestruction(war.myClan);
  let result: 'win' | 'lose' | 'draw';
  if (myS > enemyStars) result = 'win';
  else if (myS < enemyStars) result = 'lose';
  else if (myD > enD + 0.01) result = 'win';
  else if (myD < enD - 0.01) result = 'lose';
  else result = 'draw';
  war.result = result;
  const th = thLevel(state);
  const bonus = WAR_BONUS_GOLD[th - 1];
  const mul = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0.3;
  addRes(state, 'gold', Math.floor(bonus * mul));
  addRes(state, 'elixir', Math.floor(bonus * mul));
  addRes(state, 'dark', Math.floor(bonus * mul * 0.005));
  if (result === 'win') state.warsWon++;
  else if (result === 'lose') state.warsLost++;
  events.push({
    type: 'toast',
    msg: result === 'win' ? `클랜전 승리! 보너스 지급 (${myS}★ vs ${enemyStars}★)` : result === 'lose' ? `클랜전 패배... (${myS}★ vs ${enemyStars}★)` : '클랜전 무승부',
  });
}
