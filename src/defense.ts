// 방어(부재중 약탈) 시뮬레이션 + 공격 결과 적용
import { shieldForDestruction, thLootMultiplier } from './data';
import { thLevel, warWeight } from './state';
import { addRes, lootAvailable, type EcoEvent } from './economy';
import { randomName } from './basegen';
import type { GameState, GeneratedBase, LogEntry } from './types';

// 트로피 획득/손실 계산 (상대와의 트로피 차 기반)
export function trophyOffer(myTrophies: number, enemyTrophies: number): { win: number; lose: number } {
  const diff = enemyTrophies - myTrophies;
  const win = Math.max(4, Math.min(59, Math.round(25 + diff * 0.07)));
  const lose = Math.max(4, Math.min(39, Math.round(19 - diff * 0.05)));
  return { win, lose };
}

// 플레이어의 약탈 공격 결과 적용
export function applyRaidResult(
  state: GameState,
  enemy: GeneratedBase,
  result: { stars: number; destruction: number; loot: { gold: number; elixir: number; dark: number } },
): LogEntry {
  const offer = trophyOffer(state.trophies, enemy.trophies);
  const won = result.stars >= 1;
  const dTrophy = won ? offer.win : -offer.lose;
  state.trophies = Math.max(0, state.trophies + dTrophy);
  addRes(state, 'gold', result.loot.gold);
  addRes(state, 'elixir', result.loot.elixir);
  addRes(state, 'dark', result.loot.dark);
  if (won) state.attacksWon++;
  const entry: LogEntry = {
    ts: Date.now(),
    kind: 'attack',
    enemy: enemy.name,
    stars: result.stars,
    destruction: result.destruction,
    gold: result.loot.gold,
    elixir: result.loot.elixir,
    dark: result.loot.dark,
    trophies: dTrophy,
  };
  state.log.unshift(entry);
  state.log = state.log.slice(0, 30);
  return entry;
}

// 부재중 방어 시뮬레이션 — 6시간 창마다 확률적으로 습격당함 (실드 중엔 안전)
export function simulateAwayRaids(state: GameState): EcoEvent[] {
  const events: EcoEvent[] = [];
  const now = Date.now();
  const WINDOW = 6 * 3600 * 1000;
  let cursor = Math.max(state.lastRaidCheck, state.created);
  const myWeight = warWeight(state.buildings);
  const myTH = thLevel(state);

  while (now - cursor >= WINDOW) {
    cursor += WINDOW;
    if (state.shieldUntil > cursor) continue; // 실드 보호
    if (Math.random() > 0.35) continue; // 35% 확률로 습격

    // 공격자 생성 (내 전력 ±25%)
    const attWeight = myWeight * (0.75 + Math.random() * 0.5);
    const ratio = attWeight / Math.max(1, myWeight);
    let destruction = Math.round(30 + 45 * (ratio - 0.8) + (Math.random() * 45 - 20));
    destruction = Math.max(5, Math.min(100, destruction));
    let stars = 0;
    if (destruction >= 100) stars = 3;
    else {
      if (destruction >= 50) stars++;
      if (Math.random() < 0.3 + 0.3 * (ratio - 0.8)) stars++; // 타운홀 파괴
    }

    const avail = lootAvailable(state, myTH);
    const frac = (destruction / 100) * 0.85;
    const stolenGold = Math.floor(avail.gold * frac);
    const stolenElixir = Math.floor(avail.elixir * frac);
    const stolenDark = Math.floor(avail.dark * frac);
    state.gold = Math.max(0, state.gold - stolenGold);
    state.elixir = Math.max(0, state.elixir - stolenElixir);
    state.dark = Math.max(0, state.dark - stolenDark);

    const offer = trophyOffer(state.trophies, state.trophies);
    const dTrophy = stars >= 1 ? -offer.lose : offer.win;
    state.trophies = Math.max(0, state.trophies + dTrophy);

    const shield = shieldForDestruction(destruction);
    if (shield > 0) state.shieldUntil = Math.max(state.shieldUntil, cursor + shield);

    const entry: LogEntry = {
      ts: cursor,
      kind: 'defense',
      enemy: randomName(),
      stars,
      destruction,
      gold: stolenGold,
      elixir: stolenElixir,
      dark: stolenDark,
      trophies: dTrophy,
    };
    state.log.unshift(entry);
    events.push({
      type: 'toast',
      msg: `부재중 ${entry.enemy}에게 공격당했습니다 (파괴율 ${destruction}%)`,
    });
  }
  state.log = state.log.slice(0, 30);
  state.lastRaidCheck = cursor;
  return events;
}

export { thLootMultiplier };
