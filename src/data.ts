// 클래시 오브 클랜 클래식(2015년경) 밸런스 근사 데이터 — TH1~10
// 수치·규칙만 참조했으며 그래픽/사운드/명칭 에셋은 사용하지 않음 (Supercell 팬 콘텐츠 정책 준수)
import type { BuildingDef, BLevel, TroopDef, SpellDef, ResearchStep } from './types';

const MIN = 60, H = 3600, D = 86400;

function lv(hp: number, cost: number, time: number, extra?: Partial<BLevel>): BLevel {
  return { hp, cost, time, ...extra };
}

function R(costs: number[], hoursArr: number[], labs: number[]): ResearchStep[] {
  return costs.map((c, i) => ({ cost: c, time: hoursArr[i] * H, lab: labs[i] }));
}

export const GRID = 44; // 맵 크기 (실제 홈 빌리지와 동일)

export const BUILDINGS: Record<string, BuildingDef> = {
  town_hall: {
    id: 'town_hall', name: '마을 회관', size: 4, cat: 'th', costRes: 'gold',
    countByTH: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    maxLvByTH: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    weightFactor: 30,
    levels: [
      lv(450, 0, 0), lv(1600, 1000, 5 * MIN), lv(1850, 4000, 3 * H), lv(2100, 25000, 1 * D),
      lv(2400, 150000, 2 * D), lv(2800, 750000, 4 * D), lv(3300, 1200000, 6 * D),
      lv(3900, 2000000, 8 * D), lv(4600, 4000000, 10 * D), lv(5500, 7000000, 14 * D),
    ],
  },
  builder_hut: {
    id: 'builder_hut', name: '건설업자 오두막', size: 2, cat: 'other', costRes: 'gems',
    countByTH: [2, 2, 3, 4, 5, 5, 5, 5, 5, 5],
    maxLvByTH: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    weightFactor: 1,
    levels: [lv(250, 0, 0)], // 3번째부터 젬 비용은 shop 로직에서 (500/1000/2000)
  },
  gold_mine: {
    id: 'gold_mine', name: '금광', size: 3, cat: 'resource', costRes: 'elixir', resType: 'gold',
    countByTH: [1, 2, 3, 4, 5, 6, 6, 6, 6, 6],
    maxLvByTH: [2, 4, 6, 8, 10, 10, 11, 12, 12, 12],
    weightFactor: 2,
    levels: [
      lv(400, 150, 10, { prod: 200, cap: 500 }), lv(440, 300, 1 * MIN, { prod: 400, cap: 1000 }),
      lv(480, 700, 15 * MIN, { prod: 600, cap: 1500 }), lv(520, 1400, 1 * H, { prod: 800, cap: 2500 }),
      lv(560, 3000, 2 * H, { prod: 1000, cap: 10000 }), lv(600, 7000, 6 * H, { prod: 1300, cap: 20000 }),
      lv(640, 14000, 12 * H, { prod: 1600, cap: 30000 }), lv(680, 28000, 1 * D, { prod: 1900, cap: 50000 }),
      lv(720, 56000, 2 * D, { prod: 2200, cap: 75000 }), lv(780, 84000, 3 * D, { prod: 2500, cap: 100000 }),
      lv(860, 168000, 4 * D, { prod: 3000, cap: 150000 }), lv(960, 336000, 5 * D, { prod: 3500, cap: 200000 }),
    ],
  },
  elixir_collector: {
    id: 'elixir_collector', name: '엘릭서 정제소', size: 3, cat: 'resource', costRes: 'gold', resType: 'elixir',
    countByTH: [1, 2, 3, 4, 5, 6, 6, 6, 6, 6],
    maxLvByTH: [2, 4, 6, 8, 10, 10, 11, 12, 12, 12],
    weightFactor: 2,
    levels: [
      lv(400, 150, 10, { prod: 200, cap: 500 }), lv(440, 300, 1 * MIN, { prod: 400, cap: 1000 }),
      lv(480, 700, 15 * MIN, { prod: 600, cap: 1500 }), lv(520, 1400, 1 * H, { prod: 800, cap: 2500 }),
      lv(560, 3000, 2 * H, { prod: 1000, cap: 10000 }), lv(600, 7000, 6 * H, { prod: 1300, cap: 20000 }),
      lv(640, 14000, 12 * H, { prod: 1600, cap: 30000 }), lv(680, 28000, 1 * D, { prod: 1900, cap: 50000 }),
      lv(720, 56000, 2 * D, { prod: 2200, cap: 75000 }), lv(780, 84000, 3 * D, { prod: 2500, cap: 100000 }),
      lv(860, 168000, 4 * D, { prod: 3000, cap: 150000 }), lv(960, 336000, 5 * D, { prod: 3500, cap: 200000 }),
    ],
  },
  dark_drill: {
    id: 'dark_drill', name: '다크 엘릭서 시추기', size: 3, cat: 'resource', costRes: 'elixir', resType: 'dark',
    countByTH: [0, 0, 0, 0, 0, 0, 1, 2, 3, 3],
    maxLvByTH: [0, 0, 0, 0, 0, 0, 3, 4, 6, 6],
    weightFactor: 3,
    levels: [
      lv(800, 750000, 1 * D, { prod: 20, cap: 180 }), lv(860, 900000, 1.5 * D, { prod: 40, cap: 360 }),
      lv(920, 1000000, 2 * D, { prod: 60, cap: 540 }), lv(980, 1200000, 3 * D, { prod: 80, cap: 720 }),
      lv(1060, 1500000, 4 * D, { prod: 100, cap: 900 }), lv(1160, 1800000, 5 * D, { prod: 120, cap: 1080 }),
    ],
  },
  gold_storage: {
    id: 'gold_storage', name: '골드 저장고', size: 3, cat: 'storage', costRes: 'elixir', resType: 'gold',
    countByTH: [1, 1, 2, 2, 2, 2, 2, 3, 4, 4],
    maxLvByTH: [1, 3, 6, 8, 9, 10, 11, 11, 11, 11],
    weightFactor: 4,
    levels: [
      lv(400, 300, 10, { cap: 1500 }), lv(600, 750, 30 * MIN, { cap: 3000 }),
      lv(800, 1500, 1 * H, { cap: 6000 }), lv(1000, 3000, 2 * H, { cap: 12000 }),
      lv(1200, 6000, 3 * H, { cap: 25000 }), lv(1400, 12000, 4 * H, { cap: 45000 }),
      lv(1600, 25000, 6 * H, { cap: 100000 }), lv(1700, 50000, 8 * H, { cap: 225000 }),
      lv(1800, 100000, 12 * H, { cap: 450000 }), lv(1900, 250000, 1 * D, { cap: 850000 }),
      lv(2100, 500000, 2 * D, { cap: 1750000 }),
    ],
  },
  elixir_storage: {
    id: 'elixir_storage', name: '엘릭서 저장고', size: 3, cat: 'storage', costRes: 'gold', resType: 'elixir',
    countByTH: [1, 1, 2, 2, 2, 2, 2, 3, 4, 4],
    maxLvByTH: [1, 3, 6, 8, 9, 10, 11, 11, 11, 11],
    weightFactor: 4,
    levels: [
      lv(400, 300, 10, { cap: 1500 }), lv(600, 750, 30 * MIN, { cap: 3000 }),
      lv(800, 1500, 1 * H, { cap: 6000 }), lv(1000, 3000, 2 * H, { cap: 12000 }),
      lv(1200, 6000, 3 * H, { cap: 25000 }), lv(1400, 12000, 4 * H, { cap: 45000 }),
      lv(1600, 25000, 6 * H, { cap: 100000 }), lv(1700, 50000, 8 * H, { cap: 225000 }),
      lv(1800, 100000, 12 * H, { cap: 450000 }), lv(1900, 250000, 1 * D, { cap: 850000 }),
      lv(2100, 500000, 2 * D, { cap: 1750000 }),
    ],
  },
  dark_storage: {
    id: 'dark_storage', name: '다크 엘릭서 저장고', size: 3, cat: 'storage', costRes: 'elixir', resType: 'dark',
    countByTH: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    maxLvByTH: [0, 0, 0, 0, 0, 0, 2, 4, 6, 6],
    weightFactor: 4,
    levels: [
      lv(2000, 600000, 1 * D, { cap: 10000 }), lv(2200, 1200000, 1.5 * D, { cap: 20000 }),
      lv(2400, 1800000, 2 * D, { cap: 40000 }), lv(2600, 2400000, 3 * D, { cap: 80000 }),
      lv(2900, 3000000, 4 * D, { cap: 150000 }), lv(3200, 3600000, 5 * D, { cap: 200000 }),
    ],
  },
  barracks: {
    id: 'barracks', name: '훈련소', size: 3, cat: 'army', costRes: 'elixir',
    countByTH: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4],
    maxLvByTH: [2, 4, 5, 6, 7, 8, 9, 10, 10, 10],
    weightFactor: 4,
    levels: [
      lv(250, 200, 1 * MIN), lv(270, 1000, 15 * MIN), lv(280, 2500, 2 * H), lv(290, 5000, 4 * H),
      lv(300, 10000, 8 * H), lv(310, 80000, 12 * H), lv(320, 240000, 1 * D), lv(340, 700000, 2 * D),
      lv(360, 1500000, 4 * D), lv(380, 2000000, 6 * D),
    ],
  },
  dark_barracks: {
    id: 'dark_barracks', name: '다크 훈련소', size: 3, cat: 'army', costRes: 'elixir',
    countByTH: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    maxLvByTH: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
    weightFactor: 4,
    levels: [
      lv(500, 750000, 2 * D), lv(550, 1250000, 3 * D), lv(600, 1750000, 4 * D),
      lv(650, 2250000, 5 * D), lv(700, 2750000, 5.5 * D), lv(750, 3500000, 6 * D),
    ],
  },
  army_camp: {
    id: 'army_camp', name: '군대 캠프', size: 4, cat: 'army', costRes: 'elixir',
    countByTH: [1, 1, 2, 2, 3, 3, 4, 4, 4, 4],
    maxLvByTH: [1, 2, 3, 4, 5, 6, 6, 7, 8, 8],
    weightFactor: 4,
    levels: [
      lv(250, 250, 5 * MIN, { cap: 20 }), lv(270, 2500, 1 * H, { cap: 30 }),
      lv(290, 10000, 4 * H, { cap: 35 }), lv(310, 100000, 12 * H, { cap: 40 }),
      lv(330, 250000, 1 * D, { cap: 45 }), lv(350, 750000, 2 * D, { cap: 50 }),
      lv(370, 2250000, 4 * D, { cap: 55 }), lv(390, 6750000, 7 * D, { cap: 60 }),
    ],
  },
  laboratory: {
    id: 'laboratory', name: '연구소', size: 3, cat: 'army', costRes: 'elixir',
    countByTH: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
    maxLvByTH: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8],
    weightFactor: 3,
    levels: [
      lv(250, 25000, 30 * MIN), lv(270, 50000, 5 * H), lv(280, 90000, 12 * H), lv(290, 270000, 1 * D),
      lv(310, 500000, 2 * D), lv(330, 1000000, 3 * D), lv(350, 2500000, 4 * D), lv(370, 5000000, 5 * D),
    ],
  },
  spell_factory: {
    id: 'spell_factory', name: '주문 공장', size: 3, cat: 'army', costRes: 'elixir',
    countByTH: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    maxLvByTH: [0, 0, 0, 0, 1, 2, 3, 3, 4, 5],
    weightFactor: 3,
    levels: [
      lv(425, 200000, 1 * D, { cap: 1 }), lv(470, 400000, 2 * D, { cap: 2 }),
      lv(520, 800000, 3 * D, { cap: 3 }), lv(600, 1600000, 4 * D, { cap: 4 }),
      lv(680, 3200000, 5 * D, { cap: 5 }),
    ],
  },
  cannon: {
    id: 'cannon', name: '대포', size: 3, cat: 'defense', costRes: 'gold',
    countByTH: [2, 2, 2, 3, 3, 4, 5, 5, 5, 6],
    maxLvByTH: [2, 3, 4, 5, 6, 7, 8, 10, 11, 12],
    weightFactor: 8,
    atk: { range: 9, speed: 0.8, targets: 'ground' },
    levels: [
      lv(420, 250, 10, { dps: 9 }), lv(470, 1000, 15 * MIN, { dps: 11 }), lv(520, 4000, 2 * H, { dps: 15 }),
      lv(570, 16000, 6 * H, { dps: 19 }), lv(620, 50000, 12 * H, { dps: 25 }), lv(670, 100000, 1 * D, { dps: 31 }),
      lv(730, 200000, 1.5 * D, { dps: 40 }), lv(800, 400000, 2 * D, { dps: 48 }),
      lv(880, 800000, 3 * D, { dps: 56 }), lv(960, 1600000, 4 * D, { dps: 65 }),
      lv(1060, 3200000, 5 * D, { dps: 74 }), lv(1160, 6400000, 6 * D, { dps: 85 }),
    ],
  },
  archer_tower: {
    id: 'archer_tower', name: '아처 타워', size: 3, cat: 'defense', costRes: 'gold',
    countByTH: [0, 1, 1, 2, 3, 3, 4, 5, 6, 7],
    maxLvByTH: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12],
    weightFactor: 9,
    atk: { range: 10, speed: 0.5, targets: 'both' },
    levels: [
      lv(380, 1000, 15 * MIN, { dps: 11 }), lv(420, 2000, 1 * H, { dps: 15 }), lv(460, 5000, 4 * H, { dps: 19 }),
      lv(500, 20000, 8 * H, { dps: 25 }), lv(540, 80000, 12 * H, { dps: 30 }), lv(580, 180000, 1 * D, { dps: 35 }),
      lv(630, 360000, 1.5 * D, { dps: 42 }), lv(690, 720000, 2 * D, { dps: 48 }),
      lv(750, 1500000, 3 * D, { dps: 56 }), lv(810, 3000000, 4 * D, { dps: 65 }),
      lv(890, 6000000, 5 * D, { dps: 75 }), lv(970, 7500000, 6 * D, { dps: 86 }),
    ],
  },
  mortar: {
    id: 'mortar', name: '박격포', size: 3, cat: 'defense', costRes: 'gold',
    countByTH: [0, 0, 1, 1, 1, 2, 3, 3, 3, 3],
    maxLvByTH: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8],
    weightFactor: 10,
    atk: { range: 11, minRange: 4, speed: 5, targets: 'ground', splash: 1.5, perShot: true },
    levels: [
      lv(400, 8000, 8 * H, { dps: 20 }), lv(450, 32000, 12 * H, { dps: 25 }), lv(500, 120000, 1 * D, { dps: 30 }),
      lv(550, 400000, 2 * D, { dps: 35 }), lv(600, 800000, 3 * D, { dps: 45 }),
      lv(650, 1600000, 4 * D, { dps: 55 }), lv(700, 3200000, 5 * D, { dps: 65 }),
      lv(760, 6400000, 6 * D, { dps: 75 }),
    ],
  },
  air_defense: {
    id: 'air_defense', name: '대공포', size: 3, cat: 'defense', costRes: 'gold',
    countByTH: [0, 0, 0, 1, 1, 1, 2, 3, 4, 4],
    maxLvByTH: [0, 0, 0, 2, 3, 4, 5, 6, 7, 8],
    weightFactor: 12,
    atk: { range: 10, speed: 1, targets: 'air' },
    levels: [
      lv(800, 22500, 5 * H, { dps: 80 }), lv(850, 90000, 12 * H, { dps: 110 }), lv(900, 270000, 1 * D, { dps: 140 }),
      lv(950, 500000, 2 * D, { dps: 160 }), lv(1000, 1000000, 3 * D, { dps: 190 }),
      lv(1050, 2000000, 4 * D, { dps: 230 }), lv(1100, 4000000, 5 * D, { dps: 280 }),
      lv(1210, 7000000, 6 * D, { dps: 320 }),
    ],
  },
  wizard_tower: {
    id: 'wizard_tower', name: '마법사 타워', size: 3, cat: 'defense', costRes: 'gold',
    countByTH: [0, 0, 0, 0, 1, 2, 2, 3, 4, 4],
    maxLvByTH: [0, 0, 0, 0, 2, 3, 4, 6, 7, 8],
    weightFactor: 12,
    atk: { range: 7, speed: 1.3, targets: 'both', splash: 1, perShot: true },
    levels: [
      lv(620, 180000, 12 * H, { dps: 14 }), lv(650, 360000, 1 * D, { dps: 17 }), lv(680, 720000, 2 * D, { dps: 21 }),
      lv(730, 1280000, 3 * D, { dps: 26 }), lv(840, 1960000, 3.5 * D, { dps: 31 }),
      lv(960, 2680000, 4 * D, { dps: 42 }), lv(1200, 5360000, 5 * D, { dps: 52 }),
      lv(1440, 8000000, 6 * D, { dps: 62 }),
    ],
  },
  hidden_tesla: {
    id: 'hidden_tesla', name: '숨겨진 테슬라', size: 2, cat: 'defense', costRes: 'gold',
    countByTH: [0, 0, 0, 0, 0, 0, 2, 3, 4, 4],
    maxLvByTH: [0, 0, 0, 0, 0, 0, 3, 6, 7, 8],
    weightFactor: 11,
    hiddenTrigger: 6,
    atk: { range: 7, speed: 0.6, targets: 'both' },
    levels: [
      lv(600, 1000000, 1 * D, { dps: 34 }), lv(630, 1250000, 2 * D, { dps: 41 }), lv(660, 1500000, 3 * D, { dps: 48 }),
      lv(690, 2000000, 4 * D, { dps: 55 }), lv(730, 2500000, 4.5 * D, { dps: 64 }),
      lv(770, 3000000, 5 * D, { dps: 75 }), lv(810, 3500000, 5.5 * D, { dps: 87 }),
      lv(850, 4200000, 6 * D, { dps: 99 }),
    ],
  },
  wall: {
    id: 'wall', name: '성벽', size: 1, cat: 'wall', costRes: 'gold',
    countByTH: [0, 25, 50, 75, 100, 125, 175, 225, 250, 250],
    maxLvByTH: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    weightFactor: 0.4,
    levels: [
      lv(300, 50, 0), lv(500, 1000, 0), lv(700, 5000, 0), lv(900, 10000, 0), lv(1400, 30000, 0),
      lv(2000, 75000, 0), lv(2500, 200000, 0), lv(3000, 500000, 0), lv(4000, 1000000, 0), lv(5500, 3000000, 0),
    ],
  },
  bomb: {
    id: 'bomb', name: '폭탄', size: 1, cat: 'trap', costRes: 'gold',
    countByTH: [0, 0, 2, 2, 4, 4, 6, 6, 6, 6],
    maxLvByTH: [0, 0, 1, 2, 3, 4, 5, 6, 6, 6],
    weightFactor: 2,
    trap: { for: 'ground', effect: 'damage', radius: 1.5 },
    levels: [
      lv(1, 400, 0, { dps: 20 }), lv(1, 1000, 0, { dps: 25 }), lv(1, 10000, 0, { dps: 30 }),
      lv(1, 100000, 0, { dps: 45 }), lv(1, 500000, 0, { dps: 60 }), lv(1, 1000000, 0, { dps: 75 }),
    ],
  },
  spring_trap: {
    id: 'spring_trap', name: '스프링 함정', size: 1, cat: 'trap', costRes: 'gold',
    countByTH: [0, 0, 0, 2, 2, 4, 4, 4, 6, 6],
    maxLvByTH: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
    weightFactor: 2,
    trap: { for: 'ground', effect: 'spring', radius: 0.9 },
    levels: [lv(1, 2000, 0, { dps: 0, cap: 15 })],
  },
  giant_bomb: {
    id: 'giant_bomb', name: '대형 폭탄', size: 2, cat: 'trap', costRes: 'gold',
    countByTH: [0, 0, 0, 0, 0, 1, 2, 3, 4, 4],
    maxLvByTH: [0, 0, 0, 0, 0, 1, 2, 3, 4, 4],
    weightFactor: 4,
    trap: { for: 'ground', effect: 'damage', radius: 2 },
    levels: [
      lv(1, 12500, 0, { dps: 150 }), lv(1, 25000, 0, { dps: 180 }),
      lv(1, 75000, 0, { dps: 210 }), lv(1, 250000, 0, { dps: 250 }),
    ],
  },
  air_bomb: {
    id: 'air_bomb', name: '공중 폭탄', size: 1, cat: 'trap', costRes: 'gold',
    countByTH: [0, 0, 0, 0, 1, 1, 2, 2, 4, 4],
    maxLvByTH: [0, 0, 0, 0, 1, 2, 2, 3, 4, 4],
    weightFactor: 3,
    trap: { for: 'air', effect: 'damage', radius: 2.5 },
    levels: [
      lv(1, 4000, 0, { dps: 100 }), lv(1, 20000, 0, { dps: 120 }),
      lv(1, 200000, 0, { dps: 144 }), lv(1, 1000000, 0, { dps: 173 }),
    ],
  },
};

// 건설업자 오두막 젬 가격 (n번째 오두막, 1-based)
export const BUILDER_HUT_GEM_COST = [0, 0, 500, 1000, 2000];

export const TROOPS: Record<string, TroopDef> = {
  barbarian: {
    id: 'barbarian', name: '바바리안', housing: 1, speed: 2.0, range: 0.5, air: false, hits: 'ground',
    dps: [8, 11, 14, 18, 23, 26], hp: [45, 54, 65, 78, 95, 110],
    cost: [25, 40, 60, 100, 150, 200], costRes: 'elixir', researchRes: 'elixir', trainTime: 20,
    barracks: 'barracks', unlockLv: 1,
    research: R([50000, 150000, 500000, 1500000, 4500000], [6, 24, 72, 120, 240], [1, 3, 5, 6, 7]),
  },
  archer: {
    id: 'archer', name: '아처', housing: 1, speed: 3.0, range: 3.5, air: false, hits: 'both',
    dps: [7, 9, 12, 16, 20, 22], hp: [20, 23, 28, 33, 40, 44],
    cost: [50, 80, 120, 200, 300, 400], costRes: 'elixir', researchRes: 'elixir', trainTime: 25,
    barracks: 'barracks', unlockLv: 2,
    research: R([100000, 250000, 750000, 2250000, 6000000], [12, 48, 96, 144, 288], [1, 3, 5, 6, 7]),
  },
  goblin: {
    id: 'goblin', name: '고블린', housing: 1, speed: 4.0, range: 0.5, air: false, hits: 'ground',
    pref: 'resource', prefMul: 2,
    dps: [11, 14, 19, 24, 32, 42], hp: [25, 30, 36, 50, 56, 66],
    cost: [25, 40, 60, 80, 100, 150], costRes: 'elixir', researchRes: 'elixir', trainTime: 30,
    barracks: 'barracks', unlockLv: 3,
    research: R([50000, 250000, 750000, 2250000, 4500000], [12, 48, 96, 144, 240], [1, 3, 5, 6, 7]),
  },
  giant: {
    id: 'giant', name: '자이언트', housing: 5, speed: 1.5, range: 0.5, air: false, hits: 'ground',
    pref: 'defense',
    dps: [11, 14, 19, 24, 31, 43], hp: [300, 360, 430, 520, 670, 940],
    cost: [250, 750, 1250, 1750, 2250, 3000], costRes: 'elixir', researchRes: 'elixir', trainTime: 120,
    barracks: 'barracks', unlockLv: 4,
    research: R([100000, 250000, 750000, 2250000, 6000000], [12, 48, 96, 168, 336], [2, 4, 5, 6, 7]),
  },
  wall_breaker: {
    id: 'wall_breaker', name: '해골 돌격병', housing: 2, speed: 3.0, range: 0.5, air: false, hits: 'ground',
    pref: 'wall', prefMul: 40, suicide: true, splash: 1.5,
    dps: [12, 16, 24, 32, 46, 60], hp: [20, 24, 29, 35, 53, 72],
    cost: [1000, 1500, 2000, 2500, 3000, 3500], costRes: 'elixir', researchRes: 'elixir', trainTime: 120,
    barracks: 'barracks', unlockLv: 5,
    research: R([100000, 250000, 750000, 2250000, 6750000], [12, 48, 96, 168, 336], [2, 4, 5, 6, 7]),
  },
  balloon: {
    id: 'balloon', name: '해골 비행선', housing: 5, speed: 1.25, range: 0.5, air: true, hits: 'ground',
    pref: 'defense', splash: 1.2,
    dps: [25, 32, 48, 72, 108, 162], hp: [150, 180, 216, 280, 390, 545],
    cost: [2000, 2500, 3000, 3500, 4000, 4500], costRes: 'elixir', researchRes: 'elixir', trainTime: 300,
    barracks: 'barracks', unlockLv: 6,
    research: R([150000, 450000, 1350000, 2500000, 6000000], [24, 72, 120, 192, 336], [2, 4, 6, 6, 7]),
  },
  wizard: {
    id: 'wizard', name: '마법사', housing: 4, speed: 2.0, range: 3, air: false, hits: 'both',
    splash: 0.3,
    dps: [50, 70, 90, 125, 170, 185], hp: [75, 90, 108, 135, 165, 180],
    cost: [1500, 2000, 2500, 3000, 3500, 4000], costRes: 'elixir', researchRes: 'elixir', trainTime: 300,
    barracks: 'barracks', unlockLv: 7,
    research: R([150000, 450000, 1350000, 2500000, 7500000], [24, 72, 120, 192, 336], [3, 4, 6, 6, 7]),
  },
  healer: {
    id: 'healer', name: '치유사', housing: 14, speed: 2.0, range: 5, air: true, hits: 'ground',
    healerUnit: true, splash: 2,
    dps: [35, 42, 55, 71], hp: [500, 600, 840, 1176],
    cost: [5000, 6000, 8000, 10000], costRes: 'elixir', researchRes: 'elixir', trainTime: 600,
    barracks: 'barracks', unlockLv: 8,
    research: R([750000, 1500000, 3000000], [120, 192, 336], [5, 6, 7]),
  },
  dragon: {
    id: 'dragon', name: '드래곤', housing: 20, speed: 2.0, range: 3, air: true, hits: 'both',
    splash: 0.5,
    dps: [140, 160, 180, 200], hp: [1900, 2100, 2300, 2600],
    cost: [25000, 30000, 36000, 42000], costRes: 'elixir', researchRes: 'elixir', trainTime: 900,
    barracks: 'barracks', unlockLv: 9,
    research: R([2000000, 3000000, 7000000], [168, 264, 336], [5, 6, 7]),
  },
  pekka: {
    id: 'pekka', name: '페카', housing: 25, speed: 2.2, range: 0.6, air: false, hits: 'ground',
    dps: [240, 270, 300, 340], hp: [2800, 3100, 3500, 4000],
    cost: [30000, 35000, 42000, 50000], costRes: 'elixir', researchRes: 'elixir', trainTime: 1200,
    barracks: 'barracks', unlockLv: 10,
    research: R([3000000, 4500000, 6000000], [240, 288, 336], [6, 6, 8]),
  },
  minion: {
    id: 'minion', name: '미니언', housing: 2, speed: 4.0, range: 2.75, air: true, hits: 'both',
    dps: [35, 38, 42, 46, 50, 54], hp: [55, 60, 66, 72, 78, 84],
    cost: [6, 7, 8, 9, 10, 11], costRes: 'dark', researchRes: 'dark', trainTime: 45,
    barracks: 'dark_barracks', unlockLv: 1,
    research: R([10000, 20000, 30000, 40000, 60000], [96, 168, 240, 288, 336], [5, 6, 6, 7, 8]),
  },
  hog_rider: {
    id: 'hog_rider', name: '호그 라이더', housing: 5, speed: 3.0, range: 0.6, air: false, hits: 'ground',
    pref: 'defense', jumpsWalls: true,
    dps: [60, 70, 80, 92, 105, 118], hp: [270, 312, 360, 415, 475, 540],
    cost: [30, 40, 55, 75, 100, 130], costRes: 'dark', researchRes: 'dark', trainTime: 300,
    barracks: 'dark_barracks', unlockLv: 2,
    research: R([20000, 30000, 40000, 50000, 70000], [96, 168, 240, 288, 336], [5, 6, 6, 7, 8]),
  },
};

export const SPELLS: Record<string, SpellDef> = {
  lightning: {
    id: 'lightning', name: '번개 주문', housing: 1, cost: [15000, 16500, 18000, 20000, 22000],
    brewTime: 1800, unlockLv: 1, effect: 'lightning', radius: 2,
    power: [300, 330, 360, 390, 450],
    research: R([200000, 500000, 1000000, 2000000], [24, 72, 120, 168], [1, 3, 5, 6]),
  },
  heal: {
    id: 'heal', name: '치유 주문', housing: 1, cost: [15000, 18000, 21000, 25000, 30000],
    brewTime: 1800, unlockLv: 2, effect: 'heal', radius: 4, duration: 12,
    power: [600, 800, 1000, 1200, 1600],
    research: R([300000, 600000, 1200000, 2400000], [24, 72, 120, 192], [2, 4, 5, 6]),
  },
  rage: {
    id: 'rage', name: '분노 주문', housing: 1, cost: [23000, 25000, 27000, 30000, 33000],
    brewTime: 1800, unlockLv: 3, effect: 'rage', radius: 5, duration: 18,
    power: [1.3, 1.4, 1.5, 1.6, 1.7],
    research: R([450000, 900000, 1800000, 3000000], [48, 96, 144, 216], [3, 4, 5, 6]),
  },
};

// ---- 약탈/실드/트로피 규칙 (원작 규칙 기반) ----

// 저장고 약탈 비율 20%, 타운홀 레벨별 상한
export const STORAGE_LOOT_PCT = 0.2;
export const STORAGE_LOOT_CAP: number[] = [500, 1200, 3000, 50000, 100000, 150000, 200000, 250000, 300000, 350000];
// 수집기 약탈 비율 50% (미수확분)
export const COLLECTOR_LOOT_PCT = 0.5;
// 다크 엘릭서 저장고 5%, 상한
export const DARK_LOOT_PCT = 0.05;
export const DARK_LOOT_CAP: number[] = [0, 0, 0, 0, 0, 0, 2000, 2500, 3000, 3500];
// 타운홀 자체 보관 약탈량
export const TH_LOOT = 1000;

// 타운홀 레벨 차이에 따른 약탈 배수 (내 TH - 상대 TH)
export function thLootMultiplier(myTH: number, enemyTH: number): number {
  const diff = myTH - enemyTH;
  if (diff <= 0) return 1;
  if (diff === 1) return 0.9;
  if (diff === 2) return 0.5;
  if (diff === 3) return 0.25;
  return 0.05;
}

// 파괴율에 따른 실드 시간 (ms)
export function shieldForDestruction(destruction: number): number {
  if (destruction >= 90) return 16 * 3600 * 1000;
  if (destruction >= 60) return 12 * 3600 * 1000;
  if (destruction >= 30) return 8 * 3600 * 1000;
  return 0;
}

// 상대 검색 비용 (타운홀 레벨별)
export const SEARCH_COST: number[] = [10, 50, 100, 150, 250, 400, 500, 600, 750, 900];

// 전투 시간 (초)
export const BATTLE_TIME = 180;

// 클랜전 보너스 (상대 타운홀 레벨별 승리 보너스)
export const WAR_BONUS_GOLD: number[] = [3000, 6000, 12000, 25000, 50000, 100000, 180000, 280000, 400000, 550000];

// 장애물 젬 보상 순환 (원작의 고정 순환 근사)
export const OBSTACLE_GEMS = [6, 0, 4, 5, 1, 3, 2, 0, 5, 0, 1, 2, 0, 4, 0, 3, 0, 0, 2, 0];

export function fmtNum(n: number): string {
  n = Math.floor(n);
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return n.toLocaleString('ko-KR');
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 ${sec % 60 ? `${sec % 60}초` : ''}`.trim();
  if (sec < 86400) {
    const hrs = Math.floor(sec / 3600), min = Math.floor((sec % 3600) / 60);
    return `${hrs}시간${min ? ` ${min}분` : ''}`;
  }
  const days = Math.floor(sec / 86400), hrs = Math.floor((sec % 86400) / 3600);
  return `${days}일${hrs ? ` ${hrs}시간` : ''}`;
}

// 젬으로 즉시 완료 비용 (남은 시간 기반, 원작 근사 공식)
export function gemFinishCost(remainSec: number): number {
  if (remainSec <= 0) return 0;
  if (remainSec <= 60) return 1;
  if (remainSec <= 3600) return Math.ceil(1 + (remainSec - 60) * 19 / 3540);
  if (remainSec <= 86400) return Math.ceil(20 + (remainSec - 3600) * 240 / 82800);
  return Math.ceil(260 + (remainSec - 86400) * 740 / (6 * 86400));
}
