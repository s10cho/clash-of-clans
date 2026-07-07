// 전투 시뮬레이션 엔진
// 유닛 AI: 탐욕적 최근접 타겟 + A* 경로탐색(성벽 파괴 가중치) — 원작 스타일의 의도적 비최적 경로
import { BUILDINGS, TROOPS, SPELLS, GRID, BATTLE_TIME } from './data';
import type { PlacedBuilding } from './types';

export interface BattleBuildingState {
  uid: number;
  id: string;
  lv: number;
  x: number;
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  cx: number;
  cy: number;
  destroyed: boolean;
  isWall: boolean;
  isTrap: boolean;
  counts: boolean; // 파괴율 계산 포함 여부
  hidden: boolean; // 테슬라
  cooldown: number;
  loot: { gold: number; elixir: number; dark: number };
}

export interface BattleUnit {
  id: number;
  type: string;
  lv: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  air: boolean;
  targetUid: number | null;
  path: { x: number; y: number }[] | null;
  pathI: number;
  attackingWallUid: number | null;
  cooldown: number;
  repath: number;
  dead: boolean;
  facing: number;
  // 이번 틱 적용 배수 (분노 주문)
  dmgMul: number;
  spdMul: number;
}

export interface ActiveSpell {
  type: string;
  lv: number;
  x: number;
  y: number;
  t: number; // 남은 시간
  radius: number;
}

export interface FxEvent {
  kind: 'explosion' | 'shot' | 'zap' | 'mortar' | 'spell';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  color?: string;
  t?: number;
}

const WALL_COST = 12; // A*에서 성벽 통과(파괴) 가중치

function distToRect(px: number, py: number, b: { x: number; y: number; size: number }): number {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.size));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.size));
  return Math.hypot(dx, dy);
}

export class Battle {
  buildings: BattleBuildingState[] = [];
  units: BattleUnit[] = [];
  activeSpells: ActiveSpell[] = [];
  fx: FxEvent[] = [];
  time = 0;
  over = false;
  endReason = '';
  started = false;
  armyEmpty = false; // UI가 남은 병력 없음을 알림
  lootGained = { gold: 0, elixir: 0, dark: 0 };
  totalCount = 0;
  destroyedCount = 0;
  thDestroyed = false;
  private nextUnitId = 1;
  private blocked: Uint8Array; // 정적 장애물 (성벽 제외 건물)
  private wallAt = new Map<number, BattleBuildingState>();
  private noDeploy: Uint8Array;
  private buildingByUid = new Map<number, BattleBuildingState>();

  constructor(base: PlacedBuilding[], loot: { gold: number; elixir: number; dark: number }) {
    this.blocked = new Uint8Array(GRID * GRID);
    this.noDeploy = new Uint8Array(GRID * GRID);

    for (const pb of base) {
      const def = BUILDINGS[pb.id];
      if (!def || pb.lv < 1) continue;
      const level = def.levels[pb.lv - 1];
      const st: BattleBuildingState = {
        uid: pb.uid, id: pb.id, lv: pb.lv, x: pb.x, y: pb.y, size: def.size,
        hp: level.hp, maxHp: level.hp,
        cx: pb.x + def.size / 2, cy: pb.y + def.size / 2,
        destroyed: false,
        isWall: def.cat === 'wall',
        isTrap: def.cat === 'trap',
        counts: def.cat !== 'wall' && def.cat !== 'trap',
        hidden: !!def.hiddenTrigger || def.cat === 'trap',
        cooldown: 0,
        loot: { gold: 0, elixir: 0, dark: 0 },
      };
      this.buildings.push(st);
      this.buildingByUid.set(st.uid, st);
      if (st.counts) this.totalCount++;
      if (st.isWall) {
        this.wallAt.set(pb.y * GRID + pb.x, st);
      } else if (!st.isTrap) {
        for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) {
          this.blocked[(pb.y + dy) * GRID + (pb.x + dx)] = 1;
        }
      }
      if (!st.isTrap) {
        for (let dy = -1; dy < def.size + 1; dy++) for (let dx = -1; dx < def.size + 1; dx++) {
          const nx = pb.x + dx, ny = pb.y + dy;
          if (nx >= 0 && ny >= 0 && nx < GRID && ny < GRID) this.noDeploy[ny * GRID + nx] = 1;
        }
      }
    }

    // 약탈물 분배: 저장고(용량 비례) + 타운홀 + 수집기
    this.distributeLoot(loot);
  }

  private distributeLoot(loot: { gold: number; elixir: number; dark: number }): void {
    const alloc = (res: 'gold' | 'elixir' | 'dark', total: number) => {
      if (total <= 0) return;
      const containers = this.buildings.filter((b) => {
        const def = BUILDINGS[b.id];
        return (def.resType === res && (def.cat === 'storage' || def.cat === 'resource')) || (def.cat === 'th' && res !== 'dark');
      });
      if (containers.length === 0) return;
      const weights = containers.map((b) => {
        const def = BUILDINGS[b.id];
        if (def.cat === 'th') return 1000;
        return (def.levels[b.lv - 1].cap ?? 1000) * (def.cat === 'resource' ? 0.3 : 1);
      });
      const wSum = weights.reduce((a, b) => a + b, 0);
      containers.forEach((b, i) => {
        b.loot[res] = Math.floor((total * weights[i]) / wSum);
      });
    };
    alloc('gold', loot.gold);
    alloc('elixir', loot.elixir);
    alloc('dark', loot.dark);
  }

  get destruction(): number {
    if (this.totalCount === 0) return 0;
    return Math.floor((this.destroyedCount / this.totalCount) * 100);
  }

  get stars(): number {
    let s = 0;
    if (this.destruction >= 50) s++;
    if (this.thDestroyed) s++;
    if (this.destruction >= 100) s++;
    return s;
  }

  get timeLeft(): number {
    return Math.max(0, BATTLE_TIME - this.time);
  }

  getDeployMask(): Uint8Array {
    return this.noDeploy;
  }

  canDeployAt(x: number, y: number): boolean {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return false;
    return this.noDeploy[iy * GRID + ix] === 0;
  }

  deploy(type: string, lv: number, x: number, y: number): boolean {
    if (this.over || !this.canDeployAt(x, y)) return false;
    const def = TROOPS[type];
    if (!def) return false;
    const li = Math.min(lv, def.hp.length) - 1;
    this.units.push({
      id: this.nextUnitId++,
      type, lv,
      x, y,
      hp: def.hp[li], maxHp: def.hp[li],
      air: def.air,
      targetUid: null, path: null, pathI: 0,
      attackingWallUid: null,
      cooldown: 0, repath: 0, dead: false, facing: 0,
      dmgMul: 1, spdMul: 1,
    });
    this.started = true;
    return true;
  }

  castSpell(type: string, lv: number, x: number, y: number): boolean {
    if (this.over) return false;
    const def = SPELLS[type];
    if (!def) return false;
    this.started = true;
    const li = Math.min(lv, def.power.length) - 1;
    this.fx.push({ kind: 'spell', x, y, color: def.effect === 'lightning' ? '#ffe14d' : def.effect === 'heal' ? '#ffd700' : '#c060ff', t: 0.6 });
    if (def.effect === 'lightning') {
      const dmg = def.power[li];
      for (const b of this.buildings) {
        if (b.destroyed || b.isTrap || b.isWall) continue;
        if (Math.hypot(b.cx - x, b.cy - y) <= def.radius + b.size / 2) {
          this.damageBuilding(b, dmg);
        }
      }
      this.fx.push({ kind: 'zap', x, y, t: 0.5 });
      return true;
    }
    this.activeSpells.push({ type, lv, x, y, t: def.duration ?? 1, radius: def.radius });
    return true;
  }

  private damageBuilding(b: BattleBuildingState, dmg: number): void {
    if (b.destroyed) return;
    b.hp -= dmg;
    if (b.hp <= 0) {
      b.hp = 0;
      b.destroyed = true;
      this.fx.push({ kind: 'explosion', x: b.cx, y: b.cy, t: 0.5 });
      if (b.counts) this.destroyedCount++;
      if (b.id === 'town_hall') this.thDestroyed = true;
      if (b.isWall) this.wallAt.delete(b.y * GRID + b.x);
      else if (!b.isTrap) {
        for (let dy = 0; dy < b.size; dy++) for (let dx = 0; dx < b.size; dx++) {
          this.blocked[(b.y + dy) * GRID + (b.x + dx)] = 0;
        }
      }
      this.lootGained.gold += b.loot.gold;
      this.lootGained.elixir += b.loot.elixir;
      this.lootGained.dark += b.loot.dark;
    }
  }

  // ---- A* 경로탐색 ----
  private findPath(unit: BattleUnit, target: BattleBuildingState, range: number): { x: number; y: number }[] | null {
    const N = GRID * GRID;
    const sx = Math.max(0, Math.min(GRID - 1, Math.floor(unit.x)));
    const sy = Math.max(0, Math.min(GRID - 1, Math.floor(unit.y)));
    const start = sy * GRID + sx;
    const g = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    g[start] = 0;
    // 단순 이진 힙
    const heap: number[] = [];
    const fScore = new Float64Array(N).fill(Infinity);
    const h = (idx: number) => {
      const x = (idx % GRID) + 0.5, y = Math.floor(idx / GRID) + 0.5;
      return Math.max(0, distToRect(x, y, target) - range);
    };
    fScore[start] = h(start);
    const push = (idx: number) => {
      heap.push(idx);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (fScore[heap[p]] <= fScore[heap[i]]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = 2 * i + 2;
          let m = i;
          if (l < heap.length && fScore[heap[l]] < fScore[heap[m]]) m = l;
          if (r < heap.length && fScore[heap[r]] < fScore[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    push(start);
    const isGoal = (idx: number) => {
      const x = (idx % GRID) + 0.5, y = Math.floor(idx / GRID) + 0.5;
      return distToRect(x, y, target) <= range + 0.4;
    };
    const targetCells = new Set<number>();
    for (let dy = 0; dy < target.size; dy++) for (let dx = 0; dx < target.size; dx++) {
      targetCells.add((target.y + dy) * GRID + (target.x + dx));
    }
    let goal = -1;
    let iter = 0;
    while (heap.length > 0 && iter++ < 6000) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (isGoal(cur)) { goal = cur; break; }
      const cx = cur % GRID, cy = Math.floor(cur / GRID);
      for (let d = 0; d < 8; d++) {
        const dx = [1, -1, 0, 0, 1, 1, -1, -1][d];
        const dy = [0, 0, 1, -1, 1, -1, 1, -1][d];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const nIdx = ny * GRID + nx;
        if (closed[nIdx]) continue;
        if (this.blocked[nIdx] && !targetCells.has(nIdx)) continue;
        // 대각선 코너 통과 금지
        if (dx !== 0 && dy !== 0) {
          if (this.blocked[cy * GRID + nx] || this.blocked[ny * GRID + cx]) continue;
        }
        let cost = dx !== 0 && dy !== 0 ? 1.414 : 1;
        const wall = this.wallAt.get(nIdx);
        if (wall && !wall.destroyed) cost += WALL_COST;
        const ng = g[cur] + cost;
        if (ng < g[nIdx]) {
          g[nIdx] = ng;
          fScore[nIdx] = ng + h(nIdx);
          came[nIdx] = cur;
          push(nIdx);
        }
      }
    }
    if (goal < 0) return null;
    const path: { x: number; y: number }[] = [];
    let cur = goal;
    while (cur !== -1 && cur !== start) {
      path.push({ x: (cur % GRID) + 0.5, y: Math.floor(cur / GRID) + 0.5 });
      cur = came[cur];
    }
    path.reverse();
    return path;
  }

  private acquireTarget(unit: BattleUnit): BattleBuildingState | null {
    const def = TROOPS[unit.type];
    const alive = this.buildings.filter((b) => !b.destroyed && !b.isTrap);
    if (alive.length === 0) return null;
    let candidates: BattleBuildingState[] = [];
    if (def.pref === 'defense') {
      candidates = alive.filter((b) => BUILDINGS[b.id].atk && !(b.hidden && BUILDINGS[b.id].hiddenTrigger));
    } else if (def.pref === 'resource') {
      candidates = alive.filter((b) => {
        const c = BUILDINGS[b.id].cat;
        return c === 'resource' || c === 'storage' || c === 'th';
      });
    } else if (def.pref === 'wall') {
      const walls = alive.filter((b) => b.isWall);
      if (walls.length > 0) candidates = walls;
    }
    if (candidates.length === 0) candidates = alive.filter((b) => !b.isWall);
    if (candidates.length === 0) candidates = alive;
    let best: BattleBuildingState | null = null;
    let bestD = Infinity;
    for (const b of candidates) {
      const d = distToRect(unit.x, unit.y, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  tick(dt: number): void {
    if (this.over) return;
    this.time += dt;
    this.fx = this.fx.filter((f) => (f.t = (f.t ?? 0.5) - dt) > 0);

    // 주문 지역 효과 적용
    for (const u of this.units) { u.dmgMul = 1; u.spdMul = 1; }
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      const sp = this.activeSpells[i];
      sp.t -= dt;
      const def = SPELLS[sp.type];
      const li = Math.min(sp.lv, def.power.length) - 1;
      if (def.effect === 'heal') {
        const hps = def.power[li] / (def.duration ?? 12);
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - sp.x, u.y - sp.y) <= sp.radius) {
            u.hp = Math.min(u.maxHp, u.hp + hps * dt);
          }
        }
      } else if (def.effect === 'rage') {
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - sp.x, u.y - sp.y) <= sp.radius) {
            u.dmgMul = def.power[li];
            u.spdMul = def.power[li];
          }
        }
      }
      if (sp.t <= 0) this.activeSpells.splice(i, 1);
    }

    // 유닛 업데이트
    for (const u of this.units) {
      if (u.dead) continue;
      const def = TROOPS[u.type];
      const li = Math.min(u.lv, def.dps.length) - 1;
      u.cooldown -= dt;
      u.repath -= dt;

      if (def.healerUnit) {
        this.updateHealer(u, def, li, dt);
        continue;
      }

      // 타겟 확보
      let target = u.targetUid != null ? this.buildingByUid.get(u.targetUid) : undefined;
      if (!target || target.destroyed) {
        const t = this.acquireTarget(u);
        if (!t) continue;
        u.targetUid = t.uid;
        target = t;
        u.path = null;
        u.attackingWallUid = null;
      }

      // 성벽 공격 중이면
      if (u.attackingWallUid != null) {
        const wall = this.buildingByUid.get(u.attackingWallUid);
        if (!wall || wall.destroyed) {
          u.attackingWallUid = null;
          u.path = null;
        } else {
          this.unitAttack(u, def, li, wall, true);
          continue;
        }
      }

      const inRange = distToRect(u.x, u.y, target) <= def.range + 0.45;
      if (inRange) {
        this.unitAttack(u, def, li, target, false);
        continue;
      }

      // 이동
      if (def.air || def.jumpsWalls) {
        // 직선 이동
        this.moveToward(u, def, target.cx, target.cy, dt);
      } else {
        if (!u.path || u.repath <= 0) {
          u.path = this.findPath(u, target, def.range);
          u.pathI = 0;
          u.repath = 3;
        }
        if (u.path && u.pathI < u.path.length) {
          const wp = u.path[u.pathI];
          // 다음 칸에 성벽이 있으면 성벽 공격
          const wallHere = this.wallAt.get(Math.floor(wp.y) * GRID + Math.floor(wp.x));
          if (wallHere && !wallHere.destroyed && Math.hypot(wp.x - u.x, wp.y - u.y) < 1.2) {
            u.attackingWallUid = wallHere.uid;
            continue;
          }
          this.moveToward(u, def, wp.x, wp.y, dt);
          if (Math.hypot(wp.x - u.x, wp.y - u.y) < 0.15) u.pathI++;
        } else {
          // 경로 없음 — 직진 (마지막 수단)
          this.moveToward(u, def, target.cx, target.cy, dt);
        }
      }
    }

    // 방어 시설 업데이트
    const destruction = this.destruction;
    for (const b of this.buildings) {
      if (b.destroyed) continue;
      const def = BUILDINGS[b.id];

      // 함정 발동
      if (b.isTrap && def.trap) {
        const trap = def.trap;
        for (const u of this.units) {
          if (u.dead) continue;
          if (trap.for === 'ground' && u.air) continue;
          if (trap.for === 'air' && !u.air) continue;
          if (Math.hypot(u.x - b.cx, u.y - b.cy) <= trap.radius) {
            this.triggerTrap(b, def.levels[b.lv - 1], trap);
            break;
          }
        }
        continue;
      }

      if (!def.atk) continue;

      // 테슬라 발동
      if (b.hidden && def.hiddenTrigger) {
        let show = destruction >= 51;
        if (!show) {
          for (const u of this.units) {
            if (!u.dead && Math.hypot(u.x - b.cx, u.y - b.cy) <= def.hiddenTrigger) { show = true; break; }
          }
        }
        if (show) b.hidden = false;
        else continue;
      }

      b.cooldown -= dt;
      if (b.cooldown > 0) continue;

      // 타겟 탐색
      let target: BattleUnit | null = null;
      let bestD = Infinity;
      for (const u of this.units) {
        if (u.dead) continue;
        if (def.atk.targets === 'ground' && u.air) continue;
        if (def.atk.targets === 'air' && !u.air) continue;
        const d = Math.hypot(u.x - b.cx, u.y - b.cy);
        if (d > def.atk.range) continue;
        if (def.atk.minRange && d < def.atk.minRange) continue;
        if (d < bestD) { bestD = d; target = u; }
      }
      if (!target) continue;

      b.cooldown = def.atk.speed;
      const dmg = def.atk.perShot ? (def.levels[b.lv - 1].dps ?? 0) : (def.levels[b.lv - 1].dps ?? 0) * def.atk.speed;
      if (def.atk.splash) {
        const tx = target.x, ty = target.y;
        this.fx.push({ kind: b.id === 'mortar' ? 'mortar' : 'shot', x: b.cx, y: b.cy, x2: tx, y2: ty, t: 0.35 });
        for (const u of this.units) {
          if (u.dead) continue;
          if (def.atk.targets === 'ground' && u.air) continue;
          if (def.atk.targets === 'air' && !u.air) continue;
          if (Math.hypot(u.x - tx, u.y - ty) <= def.atk.splash) this.damageUnit(u, dmg);
        }
      } else {
        this.fx.push({ kind: b.id === 'hidden_tesla' ? 'zap' : 'shot', x: b.cx, y: b.cy, x2: target.x, y2: target.y, t: 0.25 });
        this.damageUnit(target, dmg);
      }
    }

    // 종료 판정
    if (this.time >= BATTLE_TIME) {
      this.over = true;
      this.endReason = '시간 종료';
    } else if (this.destruction >= 100) {
      this.over = true;
      this.endReason = '완전 파괴!';
    } else if (this.started && this.armyEmpty && this.units.every((u) => u.dead)) {
      this.over = true;
      this.endReason = '병력 전멸';
    }
  }

  private triggerTrap(b: BattleBuildingState, level: { dps?: number; cap?: number }, trap: { for: 'ground' | 'air'; effect: 'damage' | 'spring'; radius: number }): void {
    b.destroyed = true;
    this.fx.push({ kind: 'explosion', x: b.cx, y: b.cy, t: 0.5 });
    if (trap.effect === 'damage') {
      const dmg = level.dps ?? 0;
      for (const u of this.units) {
        if (u.dead) continue;
        if (trap.for === 'ground' && u.air) continue;
        if (trap.for === 'air' && !u.air) continue;
        if (Math.hypot(u.x - b.cx, u.y - b.cy) <= trap.radius + 0.5) this.damageUnit(u, dmg);
      }
    } else {
      // 스프링: 수용량만큼 유닛 튕겨냄 (housing 5 이하)
      let cap = level.cap ?? 15;
      const nearby = this.units
        .filter((u) => !u.dead && !u.air && Math.hypot(u.x - b.cx, u.y - b.cy) <= trap.radius + 0.6)
        .sort((a, z) => Math.hypot(a.x - b.cx, a.y - b.cy) - Math.hypot(z.x - b.cx, z.y - b.cy));
      for (const u of nearby) {
        const housing = TROOPS[u.type].housing;
        if (housing > 5 || housing > cap) continue;
        cap -= housing;
        u.hp = 0;
        u.dead = true;
      }
    }
  }

  private damageUnit(u: BattleUnit, dmg: number): void {
    if (u.dead) return;
    u.hp -= dmg;
    if (u.hp <= 0) {
      u.hp = 0;
      u.dead = true;
    }
  }

  private moveToward(u: BattleUnit, def: { speed: number }, tx: number, ty: number, dt: number): void {
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return;
    const step = Math.min(d, def.speed * u.spdMul * dt);
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
    u.facing = Math.atan2(dy, dx);
  }

  private unitAttack(u: BattleUnit, def: (typeof TROOPS)[string], li: number, target: BattleBuildingState, isWall: boolean): void {
    // 해골 돌격병: 자폭
    if (def.suicide) {
      let dmg = def.dps[li] * u.dmgMul;
      if (def.pref === 'wall' && target.isWall) dmg *= def.prefMul ?? 1;
      this.damageBuilding(target, dmg);
      if (def.splash) {
        for (const b of this.buildings) {
          if (b.destroyed || b.uid === target.uid || b.isTrap) continue;
          if (Math.hypot(b.cx - u.x, b.cy - u.y) <= def.splash + b.size / 2) {
            this.damageBuilding(b, dmg * 0.5);
          }
        }
      }
      this.fx.push({ kind: 'explosion', x: u.x, y: u.y, t: 0.5 });
      u.hp = 0;
      u.dead = true;
      return;
    }
    if (u.cooldown > 0) return;
    u.cooldown = 1;
    let dmg = def.dps[li] * u.dmgMul;
    if (def.pref && !isWall) {
      const cat = BUILDINGS[target.id].cat;
      const matches =
        (def.pref === 'resource' && (cat === 'resource' || cat === 'storage' || cat === 'th')) ||
        (def.pref === 'defense' && !!BUILDINGS[target.id].atk);
      if (matches && def.prefMul) dmg *= def.prefMul;
    }
    this.damageBuilding(target, dmg);
    if (def.splash && !isWall) {
      for (const b of this.buildings) {
        if (b.destroyed || b.uid === target.uid || b.isTrap || b.isWall) continue;
        if (Math.hypot(b.cx - target.cx, b.cy - target.cy) <= def.splash + b.size / 2) {
          this.damageBuilding(b, dmg * 0.4);
        }
      }
    }
  }

  private updateHealer(u: BattleUnit, def: (typeof TROOPS)[string], li: number, dt: number): void {
    // 가장 체력 비율이 낮은 아군 지상 유닛 추적
    let target: BattleUnit | null = null;
    let worst = 1;
    for (const o of this.units) {
      if (o.dead || o.id === u.id || TROOPS[o.type].healerUnit || TROOPS[o.type].air) continue;
      const ratio = o.hp / o.maxHp;
      if (ratio < worst) { worst = ratio; target = o; }
    }
    if (!target) {
      // 치유할 대상 없음 — 아무 아군이나 따라감
      target = this.units.find((o) => !o.dead && o.id !== u.id && !TROOPS[o.type].healerUnit) ?? null;
      if (!target) return;
    }
    const d = Math.hypot(target.x - u.x, target.y - u.y);
    if (d > def.range) {
      this.moveToward(u, def, target.x, target.y, dt);
      return;
    }
    // 범위 치유
    const heal = def.dps[li] * dt;
    for (const o of this.units) {
      if (o.dead || TROOPS[o.type].air) continue;
      if (Math.hypot(o.x - target.x, o.y - target.y) <= (def.splash ?? 2)) {
        o.hp = Math.min(o.maxHp, o.hp + heal);
      }
    }
  }
}
