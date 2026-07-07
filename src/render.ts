// 아이소메트릭 캔버스 렌더러 — 모든 그래픽은 절차적으로 그림 (외부 에셋 없음)
import { BUILDINGS, TROOPS, GRID } from './data';
import { collectorStored } from './economy';
import type { GameState, PlacedBuilding, Obstacle } from './types';
import type { Battle, BattleBuildingState, BattleUnit } from './battle';

export const TILE_W = 44;
export const TILE_H = 22;

export interface Camera {
  x: number; // 타일 좌표 기준 중심
  y: number;
  zoom: number;
}

interface DrawItem {
  depth: number;
  draw: () => void;
}

// 건물별 색상 팔레트
const B_COLORS: Record<string, { body: string; roof: string; accent: string; h: number }> = {
  town_hall: { body: '#a8703d', roof: '#c9342e', accent: '#ffd75e', h: 34 },
  builder_hut: { body: '#9a7648', roof: '#7d5a34', accent: '#e8d9a0', h: 16 },
  gold_mine: { body: '#8a8a80', roof: '#6e6e64', accent: '#ffd700', h: 14 },
  elixir_collector: { body: '#8a8a80', roof: '#6e6e64', accent: '#e35bd8', h: 14 },
  dark_drill: { body: '#5a5a5a', roof: '#3d3d3d', accent: '#3b3b4a', h: 18 },
  gold_storage: { body: '#b09045', roof: '#8d7336', accent: '#ffd700', h: 22 },
  elixir_storage: { body: '#9a6b9e', roof: '#7b5480', accent: '#e35bd8', h: 22 },
  dark_storage: { body: '#4a4a55', roof: '#33333c', accent: '#8a7fb8', h: 22 },
  barracks: { body: '#7d6b52', roof: '#b5893d', accent: '#d8c9a4', h: 20 },
  dark_barracks: { body: '#4d4458', roof: '#372f42', accent: '#8a7fb8', h: 20 },
  army_camp: { body: '#6f9950', roof: '#557a3a', accent: '#e0d5b0', h: 10 },
  laboratory: { body: '#7a8fa0', roof: '#5c6f80', accent: '#7fd8e8', h: 22 },
  spell_factory: { body: '#8a6fae', roof: '#6b528c', accent: '#c9a0ff', h: 22 },
  cannon: { body: '#8a8a8a', roof: '#5c5c5c', accent: '#3d3d3d', h: 12 },
  archer_tower: { body: '#a08a68', roof: '#c9342e', accent: '#e8d9a0', h: 30 },
  mortar: { body: '#707070', roof: '#4c4c4c', accent: '#2d2d2d', h: 10 },
  air_defense: { body: '#6f8f8f', roof: '#527070', accent: '#d04545', h: 24 },
  wizard_tower: { body: '#8a6fae', roof: '#5a3f80', accent: '#c060ff', h: 32 },
  hidden_tesla: { body: '#b0a060', roof: '#8d8048', accent: '#ffe14d', h: 20 },
  wall: { body: '#9a9a92', roof: '#b8b8b0', accent: '#7c7c74', h: 10 },
  bomb: { body: '#3d3d3d', roof: '#2d2d2d', accent: '#c9342e', h: 6 },
  spring_trap: { body: '#8a7648', roof: '#6e5c38', accent: '#b0b0b0', h: 4 },
  giant_bomb: { body: '#2d2d2d', roof: '#1d1d1d', accent: '#c9342e', h: 10 },
  air_bomb: { body: '#5a3d3d', roof: '#4a2d2d', accent: '#d04545', h: 8 },
};

const T_COLORS: Record<string, string> = {
  barbarian: '#e8b04a',
  archer: '#e060a0',
  goblin: '#50c040',
  giant: '#c08050',
  wall_breaker: '#b0b0b8',
  balloon: '#d05040',
  wizard: '#7040d0',
  healer: '#f0e0ff',
  dragon: '#d04898',
  pekka: '#4048b0',
  minion: '#8098e0',
  hog_rider: '#d08840',
};

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cam: Camera = { x: GRID / 2, y: GRID / 2, zoom: 0.9 };
  w = 0;
  h = 0;
  dpr = 1;
  time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  project(tx: number, ty: number): { x: number; y: number } {
    const z = this.cam.zoom;
    const ox = this.w / 2 - ((this.cam.x - this.cam.y) * TILE_W * z) / 2;
    const oy = this.h / 2 - ((this.cam.x + this.cam.y) * TILE_H * z) / 2;
    return {
      x: ox + ((tx - ty) * TILE_W * z) / 2,
      y: oy + ((tx + ty) * TILE_H * z) / 2,
    };
  }

  unproject(sx: number, sy: number): { x: number; y: number } {
    const z = this.cam.zoom;
    const ox = this.w / 2 - ((this.cam.x - this.cam.y) * TILE_W * z) / 2;
    const oy = this.h / 2 - ((this.cam.x + this.cam.y) * TILE_H * z) / 2;
    const a = ((sx - ox) * 2) / (TILE_W * z);
    const b = ((sy - oy) * 2) / (TILE_H * z);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  private diamond(tx: number, ty: number, size: number): Path2D {
    const p1 = this.project(tx, ty);
    const p2 = this.project(tx + size, ty);
    const p3 = this.project(tx + size, ty + size);
    const p4 = this.project(tx, ty + size);
    const path = new Path2D();
    path.moveTo(p1.x, p1.y);
    path.lineTo(p2.x, p2.y);
    path.lineTo(p3.x, p3.y);
    path.lineTo(p4.x, p4.y);
    path.closePath();
    return path;
  }

  clear(bg = '#3e7c3e'): void {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = bg;
    c.fillRect(0, 0, this.w, this.h);
  }

  drawGround(): void {
    const c = this.ctx;
    // 전체 잔디 마름모
    c.fillStyle = '#63a54a';
    c.fill(this.diamond(0, 0, GRID));
    // 체크무늬 미묘한 변화
    c.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < GRID; y++) {
      for (let x = (y % 2); x < GRID; x += 2) {
        c.fill(this.diamond(x, y, 1));
      }
    }
    // 외곽선
    c.strokeStyle = '#2d5c28';
    c.lineWidth = 3;
    c.stroke(this.diamond(0, 0, GRID));
  }

  drawGrid(): void {
    const c = this.ctx;
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const a = this.project(i, 0);
      const b = this.project(i, GRID);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      const d = this.project(0, i);
      const e = this.project(GRID, i);
      c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(e.x, e.y); c.stroke();
    }
  }

  // 아이소 육면체 (건물 본체)
  private isoBox(tx: number, ty: number, size: number, height: number, body: string, roof: string): void {
    const c = this.ctx;
    const z = this.cam.zoom;
    const hh = height * z;
    const p1 = this.project(tx, ty);
    const p2 = this.project(tx + size, ty);
    const p3 = this.project(tx + size, ty + size);
    const p4 = this.project(tx, ty + size);
    // 왼쪽 면
    c.fillStyle = shade(body, -18);
    c.beginPath();
    c.moveTo(p4.x, p4.y); c.lineTo(p3.x, p3.y);
    c.lineTo(p3.x, p3.y - hh); c.lineTo(p4.x, p4.y - hh);
    c.closePath(); c.fill();
    // 오른쪽 면
    c.fillStyle = shade(body, -34);
    c.beginPath();
    c.moveTo(p3.x, p3.y); c.lineTo(p2.x, p2.y);
    c.lineTo(p2.x, p2.y - hh); c.lineTo(p3.x, p3.y - hh);
    c.closePath(); c.fill();
    // 윗면
    c.fillStyle = roof;
    c.beginPath();
    c.moveTo(p1.x, p1.y - hh); c.lineTo(p2.x, p2.y - hh);
    c.lineTo(p3.x, p3.y - hh); c.lineTo(p4.x, p4.y - hh);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 1;
    c.stroke();
  }

  drawBuildingShape(id: string, lv: number, tx: number, ty: number, opts: { hp?: number; maxHp?: number; hidden?: boolean; battle?: boolean } = {}): void {
    const def = BUILDINGS[id];
    const col = B_COLORS[id] ?? { body: '#888', roof: '#666', accent: '#aaa', h: 16 };
    const c = this.ctx;
    const z = this.cam.zoom;
    const size = def.size;
    const center = this.project(tx + size / 2, ty + size / 2);

    if (opts.hidden) return; // 숨겨진 테슬라/함정 — 전투 중 미표시

    // 바닥판
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fill(this.diamond(tx, ty, size));

    if (def.cat === 'trap') {
      // 함정 (마을에서만 표시)
      c.fillStyle = col.accent;
      c.beginPath();
      c.arc(center.x, center.y, 5 * z, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#222';
      c.stroke();
      return;
    }

    if (id === 'wall') {
      this.isoBox(tx + 0.12, ty + 0.12, 0.76, col.h + lv * 1.2, col.body, shade(col.roof, lv * 3));
      return;
    }

    const height = col.h + lv * 1.5;
    const inset = size * 0.12;
    this.isoBox(tx + inset, ty + inset, size - inset * 2, height, col.body, col.roof);

    // 건물별 액센트
    const hh = height * z;
    c.save();
    if (id === 'cannon' || id === 'mortar') {
      c.fillStyle = col.accent;
      c.beginPath();
      c.arc(center.x, center.y - hh, (id === 'cannon' ? 8 : 10) * z * (size / 3), 0, Math.PI * 2);
      c.fill();
      if (id === 'cannon') {
        c.strokeStyle = '#2d2d2d';
        c.lineWidth = 5 * z;
        c.beginPath();
        c.moveTo(center.x, center.y - hh);
        c.lineTo(center.x + 14 * z, center.y - hh - 4 * z);
        c.stroke();
      }
    } else if (id === 'archer_tower' || id === 'wizard_tower') {
      // 첨탑
      c.fillStyle = col.roof;
      c.beginPath();
      c.moveTo(center.x - 10 * z, center.y - hh);
      c.lineTo(center.x + 10 * z, center.y - hh);
      c.lineTo(center.x, center.y - hh - 16 * z);
      c.closePath();
      c.fill();
      c.fillStyle = col.accent;
      c.beginPath();
      c.arc(center.x, center.y - hh - 4 * z, 3.5 * z, 0, Math.PI * 2);
      c.fill();
    } else if (id === 'air_defense') {
      c.fillStyle = col.accent;
      c.beginPath();
      c.moveTo(center.x - 7 * z, center.y - hh + 2 * z);
      c.lineTo(center.x + 7 * z, center.y - hh + 2 * z);
      c.lineTo(center.x, center.y - hh - 14 * z);
      c.closePath();
      c.fill();
    } else if (id === 'hidden_tesla') {
      c.strokeStyle = col.accent;
      c.lineWidth = 2.5 * z;
      c.beginPath();
      c.moveTo(center.x, center.y - hh - 12 * z);
      c.lineTo(center.x - 4 * z, center.y - hh - 4 * z);
      c.lineTo(center.x + 4 * z, center.y - hh - 2 * z);
      c.lineTo(center.x, center.y - hh + 6 * z);
      c.stroke();
    } else if (def.cat === 'storage' || def.cat === 'resource') {
      c.fillStyle = col.accent;
      c.beginPath();
      c.arc(center.x, center.y - hh, 6 * z, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 1;
      c.stroke();
    } else if (id === 'town_hall') {
      // 깃발
      c.strokeStyle = '#6b4a2a';
      c.lineWidth = 2 * z;
      c.beginPath();
      c.moveTo(center.x + 12 * z, center.y - hh);
      c.lineTo(center.x + 12 * z, center.y - hh - 18 * z);
      c.stroke();
      c.fillStyle = col.accent;
      c.beginPath();
      c.moveTo(center.x + 12 * z, center.y - hh - 18 * z);
      c.lineTo(center.x + 24 * z, center.y - hh - 14 * z);
      c.lineTo(center.x + 12 * z, center.y - hh - 10 * z);
      c.closePath();
      c.fill();
    } else if (id === 'army_camp') {
      // 텐트
      c.fillStyle = col.accent;
      c.beginPath();
      c.moveTo(center.x - 14 * z, center.y - 2 * z);
      c.lineTo(center.x + 14 * z, center.y - 2 * z);
      c.lineTo(center.x, center.y - 20 * z);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.stroke();
    }
    c.restore();

    // HP 바 (전투 중, 손상된 건물)
    if (opts.battle && opts.hp !== undefined && opts.maxHp && opts.hp < opts.maxHp && opts.hp > 0) {
      const top = this.project(tx + size / 2, ty);
      const bw = 30 * z;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(top.x - bw / 2, top.y - hh - 12 * z, bw, 4 * z);
      c.fillStyle = '#40d040';
      c.fillRect(top.x - bw / 2, top.y - hh - 12 * z, bw * (opts.hp / opts.maxHp), 4 * z);
    }
  }

  private drawLevelBadge(tx: number, ty: number, size: number, lv: number): void {
    if (lv < 2) return;
    const c = this.ctx;
    const z = this.cam.zoom;
    const p = this.project(tx + size, ty + size);
    c.fillStyle = 'rgba(20,20,30,0.75)';
    c.beginPath();
    c.arc(p.x - 6 * z, p.y - 6 * z, 8 * z, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffd75e';
    c.font = `bold ${10 * z}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(lv), p.x - 6 * z, p.y - 6 * z);
  }

  drawObstacle(o: Obstacle): void {
    const c = this.ctx;
    const z = this.cam.zoom;
    const size = o.kind >= 4 ? 2 : 1;
    const p = this.project(o.x + size / 2, o.y + size / 2);
    if (o.kind >= 4) {
      // 바위
      c.fillStyle = '#8f8f88';
      c.beginPath();
      c.ellipse(p.x, p.y - 6 * z, 16 * z, 11 * z, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#a8a8a0';
      c.beginPath();
      c.ellipse(p.x - 4 * z, p.y - 10 * z, 9 * z, 6 * z, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      // 나무
      c.fillStyle = '#6b4a2a';
      c.fillRect(p.x - 2 * z, p.y - 10 * z, 4 * z, 10 * z);
      c.fillStyle = ['#2d7a2d', '#357f35', '#2d6f3a', '#3a8a2d'][o.kind % 4];
      c.beginPath();
      c.arc(p.x, p.y - 16 * z, 10 * z, 0, Math.PI * 2);
      c.arc(p.x - 6 * z, p.y - 10 * z, 7 * z, 0, Math.PI * 2);
      c.arc(p.x + 6 * z, p.y - 10 * z, 7 * z, 0, Math.PI * 2);
      c.fill();
    }
    if (o.clearEnd && o.clearEnd > Date.now()) {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = `${9 * z}px sans-serif`;
      c.textAlign = 'center';
      c.fillText('제거 중...', p.x, p.y + 8 * z);
    }
  }

  // ---- 마을 화면 ----
  drawVillage(
    state: GameState,
    opts: {
      selectedUid?: number | null;
      placing?: { id: string; x: number; y: number; valid: boolean } | null;
      movingUid?: number | null;
    } = {},
  ): void {
    this.clear();
    this.drawGround();
    if (opts.placing || opts.movingUid) this.drawGrid();

    const items: DrawItem[] = [];
    const now = Date.now();

    for (const b of state.buildings) {
      if (opts.movingUid === b.uid) continue;
      const def = BUILDINGS[b.id];
      items.push({
        depth: b.x + b.y + def.size,
        draw: () => {
          const selected = opts.selectedUid === b.uid;
          if (selected) {
            this.ctx.fillStyle = 'rgba(255,255,255,0.35)';
            this.ctx.fill(this.diamond(b.x - 0.2, b.y - 0.2, def.size + 0.4));
          }
          this.drawBuildingShape(b.id, Math.max(1, b.lv), b.x, b.y);
          this.drawLevelBadge(b.x, b.y, def.size, b.lv);
          // 진행 중 작업
          if (b.upEnd && b.upEnd > now) {
            this.drawProgress(b.x, b.y, def.size, b.upEnd, def.levels[Math.min(b.lv, def.levels.length - 1)].time * 1000);
          }
          // 수집 가능 표시
          if (def.cat === 'resource' && b.lv >= 1) {
            const stored = collectorStored(b, now);
            const cap = def.levels[b.lv - 1].cap ?? 1;
            if (stored > Math.max(50, cap * 0.15)) {
              const p = this.project(b.x + def.size / 2, b.y + def.size / 2);
              const z = this.cam.zoom;
              const bounce = Math.sin(this.time * 3) * 3 * z;
              this.ctx.fillStyle = def.resType === 'gold' ? '#ffd700' : def.resType === 'elixir' ? '#e35bd8' : '#3b3b4a';
              this.ctx.beginPath();
              this.ctx.arc(p.x, p.y - (B_COLORS[b.id]?.h ?? 14) * z - 16 * z + bounce, 7 * z, 0, Math.PI * 2);
              this.ctx.fill();
              this.ctx.strokeStyle = '#fff';
              this.ctx.lineWidth = 1.5;
              this.ctx.stroke();
            }
          }
        },
      });
    }

    for (const o of state.obstacles) {
      const size = o.kind >= 4 ? 2 : 1;
      items.push({ depth: o.x + o.y + size, draw: () => this.drawObstacle(o) });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // 배치 고스트
    if (opts.placing) {
      const { id, x, y, valid } = opts.placing;
      const def = BUILDINGS[id];
      this.ctx.globalAlpha = 0.6;
      this.ctx.fillStyle = valid ? 'rgba(80,255,80,0.5)' : 'rgba(255,60,60,0.5)';
      this.ctx.fill(this.diamond(x, y, def.size));
      this.drawBuildingShape(id, 1, x, y);
      this.ctx.globalAlpha = 1;
    }
  }

  private drawProgress(tx: number, ty: number, size: number, endTs: number, totalMs: number): void {
    const c = this.ctx;
    const z = this.cam.zoom;
    const p = this.project(tx + size / 2, ty + size / 2);
    const remain = Math.max(0, endTs - Date.now());
    const frac = totalMs > 0 ? 1 - remain / totalMs : 1;
    const yOff = (B_COLORS['town_hall']?.h ?? 20) * z + 24 * z;
    c.fillStyle = 'rgba(20,20,30,0.7)';
    c.fillRect(p.x - 20 * z, p.y - yOff, 40 * z, 6 * z);
    c.fillStyle = '#5bc9ff';
    c.fillRect(p.x - 20 * z, p.y - yOff, 40 * z * Math.max(0, Math.min(1, frac)), 6 * z);
    c.strokeStyle = '#fff';
    c.lineWidth = 1;
    c.strokeRect(p.x - 20 * z, p.y - yOff, 40 * z, 6 * z);
  }

  // ---- 전투 화면 ----
  drawBattle(battle: Battle, showDeployZone: boolean): void {
    this.clear('#5c7a3e');
    this.drawGround();

    // 배포 금지 구역
    if (showDeployZone) {
      const mask = battle.getDeployMask();
      this.ctx.fillStyle = 'rgba(255,50,50,0.13)';
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          if (mask[y * GRID + x]) this.ctx.fill(this.diamond(x, y, 1));
        }
      }
    }

    const items: DrawItem[] = [];
    for (const b of battle.buildings) {
      if (b.destroyed && !b.isWall) {
        if (!b.isTrap) {
          items.push({
            depth: b.x + b.y,
            draw: () => {
              // 잔해
              this.ctx.fillStyle = 'rgba(60,50,40,0.55)';
              this.ctx.fill(this.diamond(b.x, b.y, b.size));
              const p = this.project(b.x + b.size / 2, b.y + b.size / 2);
              this.ctx.fillStyle = '#4d4438';
              this.ctx.beginPath();
              this.ctx.ellipse(p.x, p.y - 3, 10 * this.cam.zoom, 6 * this.cam.zoom, 0, 0, Math.PI * 2);
              this.ctx.fill();
            },
          });
        }
        continue;
      }
      if (b.destroyed) continue;
      items.push({
        depth: b.x + b.y + b.size,
        draw: () => this.drawBuildingShape(b.id, b.lv, b.x, b.y, { hp: b.hp, maxHp: b.maxHp, hidden: b.hidden, battle: true }),
      });
    }

    for (const u of battle.units) {
      if (u.dead) continue;
      items.push({ depth: u.x + u.y + (u.air ? 100 : 0), draw: () => this.drawUnit(u) });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // 활성 주문 지역
    for (const sp of battle.activeSpells) {
      const p = this.project(sp.x, sp.y);
      const z = this.cam.zoom;
      this.ctx.strokeStyle = sp.type === 'heal' ? 'rgba(255,215,0,0.7)' : 'rgba(192,96,255,0.7)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.ellipse(p.x, p.y, sp.radius * TILE_W * z * 0.5, sp.radius * TILE_H * z * 0.5, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // 이펙트
    for (const f of battle.fx) {
      const p = this.project(f.x, f.y);
      const z = this.cam.zoom;
      const life = (f.t ?? 0) / 0.5;
      if (f.kind === 'explosion') {
        this.ctx.fillStyle = `rgba(255,${Math.floor(140 + 80 * life)},40,${Math.max(0, life) * 0.8})`;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y - 8 * z, (1 - life) * 22 * z + 6 * z, 0, Math.PI * 2);
        this.ctx.fill();
      } else if ((f.kind === 'shot' || f.kind === 'zap' || f.kind === 'mortar') && f.x2 !== undefined && f.y2 !== undefined) {
        const p2 = this.project(f.x2, f.y2);
        this.ctx.strokeStyle = f.kind === 'zap' ? 'rgba(255,225,77,0.9)' : f.kind === 'mortar' ? 'rgba(90,90,90,0.9)' : 'rgba(255,255,255,0.65)';
        this.ctx.lineWidth = f.kind === 'zap' ? 2.5 : 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y - 14 * z);
        if (f.kind === 'mortar') {
          const mx = (p.x + p2.x) / 2, my = Math.min(p.y, p2.y) - 60 * z;
          this.ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
        } else {
          this.ctx.lineTo(p2.x, p2.y - 4 * z);
        }
        this.ctx.stroke();
      } else if (f.kind === 'spell') {
        this.ctx.fillStyle = f.color ?? 'rgba(255,255,255,0.5)';
        this.ctx.globalAlpha = Math.max(0, life) * 0.5;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 26 * z, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      }
    }
  }

  drawUnit(u: BattleUnit): void {
    const c = this.ctx;
    const z = this.cam.zoom;
    const p = this.project(u.x, u.y);
    const color = T_COLORS[u.type] ?? '#fff';
    const def = TROOPS[u.type];
    const r = (3 + Math.sqrt(def.housing) * 2.2) * z;
    const lift = u.air ? 26 * z : 0;

    // 그림자
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(p.x, p.y, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
    c.fill();

    // 본체
    c.fillStyle = color;
    c.beginPath();
    c.arc(p.x, p.y - r - lift, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 1.5;
    c.stroke();

    // 방향 표시
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath();
    c.arc(p.x + Math.cos(u.facing) * r * 0.5, p.y - r - lift + Math.sin(u.facing) * r * 0.3, r * 0.25, 0, Math.PI * 2);
    c.fill();

    // HP 바
    if (u.hp < u.maxHp) {
      const bw = 18 * z;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(p.x - bw / 2, p.y - r * 2 - lift - 8 * z, bw, 3 * z);
      c.fillStyle = u.hp / u.maxHp > 0.4 ? '#40d040' : '#e04040';
      c.fillRect(p.x - bw / 2, p.y - r * 2 - lift - 8 * z, bw * (u.hp / u.maxHp), 3 * z);
    }
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}
