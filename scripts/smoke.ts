// 헤드리스 스모크 테스트: 기지 생성 + 전투 시뮬레이션 + 경제 로직
import { generateBase, generateOpponent } from '../src/basegen';
import { Battle } from '../src/battle';
import { newGame, warWeight, thLevel, armyCapacity } from '../src/state';
import { economyTick, trainTroop, lootAvailable } from '../src/economy';
import { startWar, warTick } from '../src/war';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}`);
  if (!cond) failures++;
}

// 1) 기지 생성
const base = generateBase({ th: 5, trophies: 300 });
check('기지 생성: 건물 20개 이상', base.buildings.length > 20);
check('기지 생성: 타운홀 포함', base.buildings.some((b) => b.id === 'town_hall'));
check('기지 생성: 성벽 포함', base.buildings.some((b) => b.id === 'wall'));
check('기지 생성: 전쟁 무게 > 0', base.weight > 0);
const overlaps = (() => {
  const seen = new Set<string>();
  for (const b of base.buildings) {
    if (b.id === 'wall') continue;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const key = `${b.x + dx},${b.y + dy}`;
      void key;
    }
  }
  // 정확한 중첩 검사: 셀 점유 기록
  const occ = new Set<string>();
  for (const b of base.buildings) {
    const size = b.id === 'town_hall' || b.id === 'army_camp' ? 4 : b.id === 'wall' || b.id === 'bomb' || b.id === 'spring_trap' || b.id === 'air_bomb' ? 1 : b.id === 'builder_hut' || b.id === 'hidden_tesla' || b.id === 'giant_bomb' ? 2 : 3;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const k = `${b.x + dx},${b.y + dy}`;
      if (occ.has(k)) return true;
      occ.add(k);
    }
  }
  return false;
})();
check('기지 생성: 건물 중첩 없음', !overlaps);

// 2) 전투: 바바리안 물량으로 TH3 기지 공격
const enemy = generateBase({ th: 3, trophies: 100, strength: 0.5 });
const battle = new Battle(enemy.buildings, { gold: 10000, elixir: 10000, dark: 0 });
let deployed = 0;
for (let i = 0; i < 60; i++) {
  const angle = (i / 60) * Math.PI * 2;
  const x = 22 + Math.cos(angle) * 19;
  const y = 22 + Math.sin(angle) * 19;
  if (battle.deploy('barbarian', 3, x, y)) deployed++;
}
check(`전투: 유닛 배포됨 (${deployed}/60)`, deployed > 30);
battle.armyEmpty = true;
let ticks = 0;
while (!battle.over && ticks++ < 180 * 30) battle.tick(1 / 30);
console.log(`  → ${battle.time.toFixed(0)}초, 파괴율 ${battle.destruction}%, 별 ${battle.stars}, 약탈 ${battle.lootGained.gold}G/${battle.lootGained.elixir}E, 종료: ${battle.endReason}`);
check('전투: 종료됨', battle.over);
check('전투: 파괴율 > 20%', battle.destruction > 20);
check('전투: 약탈 > 0', battle.lootGained.gold > 0);
check('전투: 파괴율에 비례한 별', battle.destruction >= 50 ? battle.stars >= 1 : true);

// 3) 공중 유닛 전투 (드래곤)
const enemy2 = generateBase({ th: 4, trophies: 200, strength: 0.5 });
const b2 = new Battle(enemy2.buildings, { gold: 5000, elixir: 5000, dark: 0 });
for (let i = 0; i < 6; i++) b2.deploy('dragon', 1, 4 + i * 7, 3);
b2.armyEmpty = true;
ticks = 0;
while (!b2.over && ticks++ < 180 * 30) b2.tick(1 / 30);
console.log(`  → 드래곤: 파괴율 ${b2.destruction}%, 별 ${b2.stars}`);
check('공중 전투: 파괴율 > 50%', b2.destruction > 50);

// 4) 경제
const state = newGame();
check('새 게임: 타운홀 1', thLevel(state) === 1);
check('새 게임: 군대 캠프 없음 → 용량 0', armyCapacity(state) === 0);
state.buildings.push({ uid: 999, id: 'army_camp', lv: 1, x: 5, y: 5 });
state.buildings.push({ uid: 998, id: 'barracks', lv: 1, x: 9, y: 5 });
state.elixir = 5000;
const r = trainTroop(state, 'barbarian');
check('훈련 시작', r.ok);
economyTick(state, 25); // 20초 훈련
check('훈련 완료 → 군대 합류', (state.army['barbarian'] ?? 0) === 1);
const loot = lootAvailable(state, 1);
check('약탈 가능 자원 계산', loot.gold >= 0 && loot.elixir >= 0);

// 5) 클랜전
const war = startWar(state, true);
state.war = war;
check('클랜전: 5v5', war.myClan.length === 5 && war.enemyClan.length === 5);
check('클랜전: AI 공격 스케줄 18건 (아군 AI 4명 + 적 5명, 각 2회)', war.schedule.length === 18);
war.prepEnd = Date.now() - 1000 * 3600 * 3;
war.battleEnd = Date.now() - 1000;
for (const s of war.schedule) s.ts = Date.now() - 1000 * 60;
warTick(state);
check('클랜전: 종료 처리', state.war!.phase === 'ended');
check('클랜전: 결과 판정', ['win', 'lose', 'draw'].includes(state.war!.result!));
console.log(`  → 전쟁 결과: ${state.war!.result}, 우리 ★${state.war!.enemyClan.reduce((s, m) => s + m.stars, 0)} vs 상대 ★${state.war!.myClan.reduce((s, m) => s + m.stars, 0)}`);

console.log(failures === 0 ? '\n모든 스모크 테스트 통과!' : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
