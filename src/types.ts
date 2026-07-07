// 공유 타입 정의
export type Res = 'gold' | 'elixir' | 'dark' | 'gems';

export interface BLevel {
  hp: number;
  cost: number;
  time: number; // 초
  cap?: number; // 저장 용량 / 캠프 수용량 / 주문 공장 슬롯
  prod?: number; // 시간당 생산량
  dps?: number; // 방어 시설 DPS (atk.perShot이면 발당 피해)
}

export interface AtkSpec {
  range: number;
  minRange?: number;
  speed: number; // 발사 간격(초)
  targets: 'ground' | 'air' | 'both';
  splash?: number; // 범위 피해 반경
  perShot?: boolean; // dps 값이 발당 피해량임
}

export type BCat = 'th' | 'resource' | 'storage' | 'army' | 'defense' | 'wall' | 'trap' | 'other';

export interface BuildingDef {
  id: string;
  name: string;
  size: number;
  cat: BCat;
  costRes: Res;
  countByTH: number[]; // 타운홀 1~10 레벨별 보유 가능 수
  maxLvByTH: number[]; // 타운홀 1~10 레벨별 최대 레벨
  levels: BLevel[];
  atk?: AtkSpec;
  hiddenTrigger?: number; // 숨겨진 테슬라 발동 반경
  trap?: { for: 'ground' | 'air'; effect: 'damage' | 'spring'; radius: number };
  resType?: 'gold' | 'elixir' | 'dark';
  weightFactor: number; // 전쟁 무게 계수
}

export interface ResearchStep {
  cost: number;
  time: number; // 초
  lab: number; // 필요 연구소 레벨
}

export interface TroopDef {
  id: string;
  name: string;
  housing: number;
  speed: number; // 타일/초
  range: number;
  air: boolean; // 공중 유닛 여부
  hits: 'ground' | 'air' | 'both';
  pref?: 'defense' | 'resource' | 'wall';
  healerUnit?: boolean;
  splash?: number;
  prefMul?: number; // 선호 타겟 피해 배수 (고블린 x2, 해골돌격병 x40)
  dps: number[];
  hp: number[];
  cost: number[];
  costRes: Res;
  researchRes: Res;
  trainTime: number; // 초
  barracks: 'barracks' | 'dark_barracks';
  unlockLv: number; // 훈련소 레벨
  research: ResearchStep[]; // 레벨 2부터
  jumpsWalls?: boolean;
  suicide?: boolean;
}

export interface SpellDef {
  id: string;
  name: string;
  housing: number;
  cost: number[];
  brewTime: number;
  unlockLv: number; // 주문 공장 레벨
  research: ResearchStep[];
  effect: 'lightning' | 'heal' | 'rage';
  radius: number;
  power: number[]; // 효과 수치 (피해량/총 회복량/배수)
  duration?: number;
}

// ---- 게임 상태 ----

export interface PlacedBuilding {
  uid: number;
  id: string;
  lv: number; // 0 = 건설 중(최초)
  x: number;
  y: number;
  upEnd?: number; // 건설/업그레이드 완료 시각(ms)
  lastCollect?: number; // 수집기: 마지막 수확 시각
}

export interface Obstacle {
  uid: number;
  kind: number; // 0~3 나무, 4~5 바위
  x: number;
  y: number;
  clearEnd?: number;
}

export interface QueueItem {
  id: string;
  rem: number; // 남은 훈련 시간(초) — 병렬 훈련 헤드가 동시에 감소시킴
}

export interface LogEntry {
  ts: number;
  kind: 'defense' | 'attack';
  enemy: string;
  stars: number;
  destruction: number;
  gold: number;
  elixir: number;
  dark: number;
  trophies: number;
}

export interface GeneratedBase {
  name: string;
  th: number;
  weight: number;
  trophies: number;
  buildings: PlacedBuilding[];
  loot: { gold: number; elixir: number; dark: number };
}

export interface WarMember {
  name: string;
  th: number;
  weight: number;
  stars: number; // 이 기지에 대해 상대가 획득한 최고 별
  bestDestruction: number;
  attacksUsed: number;
  isPlayer?: boolean;
  base?: GeneratedBase | null; // 적 클랜 멤버: 생성된 기지 캐시
}

export interface WarAttackLog {
  ts: number;
  attacker: string;
  defender: string;
  stars: number; // 이 공격으로 새로 확보된 별 수(신규)
  totalStars: number; // 공격 자체의 별 수
  destruction: number;
  enemySide: boolean; // 공격자가 적 클랜인가
}

export interface WarState {
  phase: 'prep' | 'battle' | 'ended';
  prepEnd: number;
  battleEnd: number;
  enemyClanName: string;
  myClan: WarMember[];
  enemyClan: WarMember[];
  schedule: { ts: number; side: 'my' | 'enemy'; attackerIdx: number; defenderIdx: number; done: boolean }[];
  log: WarAttackLog[];
  result?: 'win' | 'lose' | 'draw';
  bonusClaimed?: boolean;
}

export interface GameState {
  v: number;
  created: number;
  lastSeen: number;
  name: string;
  gold: number;
  elixir: number;
  dark: number;
  gems: number;
  trophies: number;
  shieldUntil: number;
  nextUid: number;
  buildings: PlacedBuilding[];
  obstacles: Obstacle[];
  army: Record<string, number>;
  spells: Record<string, number>;
  trainQ: QueueItem[];
  spellQ: QueueItem[];
  research: Record<string, number>; // 유닛/주문 현재 레벨
  labUntil: number;
  labItem: string | null;
  log: LogEntry[];
  war: WarState | null;
  warsWon: number;
  warsLost: number;
  attacksWon: number;
  achieved: Record<string, number>; // 달성 단계
  lastObstacleSpawn: number;
  lastRaidCheck: number;
  settings: { fastWar: boolean };
}
