// 게임 UI: HUD, 다이얼로그, 입력 제스처, 전투 플로우
import {
  BUILDINGS, TROOPS, SPELLS, GRID, fmtNum, fmtTime, SEARCH_COST, gemFinishCost, thLootMultiplier, BATTLE_TIME,
} from './data';
import {
  thLevel, builderTotal, buildersFree, storageCap, armyCapacity, armyUsed, spellCapacity, spellsUsed,
  occupiedCells, canPlaceAt, findFreeSpot, saveState, warWeight,
} from './state';
import {
  economyTick, collect, collectorStored, placeBuilding, startUpgrade, canUpgrade, canBuyBuilding,
  nextBuildCost, buildingCount, clearObstacle, obstacleClearCost, trainTroop, cancelTrain, brewSpell,
  troopUnlocked, canResearch, startResearch, labLevel, finishBuildingWithGems, spendRes, canAfford,
  lootAvailable, ACHIEVEMENTS, type EcoEvent,
} from './economy';
import { generateOpponent } from './basegen';
import { Battle } from './battle';
import { applyRaidResult, trophyOffer, simulateAwayRaids } from './defense';
import { startWar, warTick, warBaseFor, applyWarAttack, playerAttacksLeft, warStars, warDestruction, ATTACKS_PER_MEMBER } from './war';
import { Renderer } from './render';
import type { GameState, GeneratedBase, Res } from './types';

type Mode = 'village' | 'battle';

interface BattleCtx {
  battle: Battle;
  enemy: GeneratedBase;
  kind: 'raid' | 'war';
  warMemberIdx: number;
  armyRemaining: Record<string, number>;
  spellsRemaining: Record<string, number>;
  selected: string | null;
  resultShown: boolean;
  acc: number;
}

const RES_COLORS: Record<string, string> = { gold: '#ffd700', elixir: '#e35bd8', dark: '#3b3b4a', gems: '#3ddc84' };
const RES_NAMES: Record<string, string> = { gold: '골드', elixir: '엘릭서', dark: '다크 엘릭서', gems: '젬' };

function resSpan(res: Res, amount: number): string {
  const cls = res === 'gold' ? 'gold-t' : res === 'elixir' ? 'elixir-t' : res === 'dark' ? 'dark-t' : 'gem-t';
  return `<span class="${cls}">${fmtNum(amount)} ${RES_NAMES[res]}</span>`;
}

export class Game {
  state: GameState;
  renderer: Renderer;
  mode: Mode = 'village';
  battleCtx: BattleCtx | null = null;

  private hud: HTMLElement;
  private dialogRoot: HTMLElement;
  private toastRoot: HTMLElement;
  private infoPanel: HTMLElement | null = null;

  private selected: { kind: 'b' | 'o'; uid: number } | null = null;
  private placing: { id: string; x: number; y: number } | null = null;
  private movingUid: number | null = null;

  private pointers = new Map<number, { x: number; y: number }>();
  private downInfo: { x: number; y: number; t: number; moved: boolean } | null = null;
  private pinchDist = 0;

  private hudTimer = 0;
  private saveTimer = 0;
  private dialogRefresh: (() => void) | null = null;
  private dialogRefreshTimer = 0;

  constructor(state: GameState, canvas: HTMLCanvasElement) {
    this.state = state;
    this.renderer = new Renderer(canvas);
    this.hud = document.getElementById('hud')!;
    this.dialogRoot = document.getElementById('dialog-root')!;
    this.toastRoot = document.getElementById('toast-root')!;
    this.setupInput(canvas);
    this.renderHUD();

    // 오프라인 경과 처리
    const elapsedSec = Math.max(0, (Date.now() - state.lastSeen) / 1000);
    if (elapsedSec > 60) {
      this.toast(`돌아오신 것을 환영합니다! (${fmtTime(elapsedSec)} 경과)`);
    }
    this.handleEvents(economyTick(state, elapsedSec));
    this.handleEvents(simulateAwayRaids(state));
    this.handleEvents(warTick(state));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void saveState(this.state);
    });
    window.addEventListener('pagehide', () => void saveState(this.state));
  }

  toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 3200);
    while (this.toastRoot.children.length > 4) this.toastRoot.firstChild?.remove();
  }

  private handleEvents(events: EcoEvent[]): void {
    for (const e of events) {
      if (e.type === 'achievement') this.toast(`🏆 ${e.msg} +${e.gems}젬`);
      else this.toast(e.msg);
    }
  }

  // ---- 메인 루프 ----
  frame(dt: number): void {
    this.renderer.time += dt;
    if (this.mode === 'village') {
      this.handleEvents(economyTick(this.state, dt));
      this.handleEvents(warTick(this.state));
      let placingParam: { id: string; x: number; y: number; valid: boolean } | null = null;
      if (this.placing) {
        placingParam = { ...this.placing, valid: this.placingValid() };
      } else if (this.movingUid !== null && this.moveGhost) {
        const mb = this.state.buildings.find((x) => x.uid === this.movingUid);
        if (mb) {
          const occ = occupiedCells(this.state, mb.uid);
          placingParam = {
            id: mb.id,
            x: this.moveGhost.x,
            y: this.moveGhost.y,
            valid: canPlaceAt(occ, BUILDINGS[mb.id].size, this.moveGhost.x, this.moveGhost.y),
          };
        }
      }
      this.renderer.drawVillage(this.state, {
        selectedUid: this.selected?.kind === 'b' ? this.selected.uid : null,
        placing: placingParam,
        movingUid: this.movingUid,
      });
    } else if (this.battleCtx) {
      const ctx = this.battleCtx;
      ctx.acc += dt;
      const STEP = 1 / 30;
      let steps = 0;
      while (ctx.acc >= STEP && steps++ < 8) {
        ctx.battle.tick(STEP);
        ctx.acc -= STEP;
      }
      this.renderer.drawBattle(ctx.battle, ctx.selected !== null);
      if (ctx.battle.over && !ctx.resultShown) {
        ctx.resultShown = true;
        this.finishBattle();
      }
    }

    this.hudTimer += dt;
    if (this.hudTimer > 0.3) {
      this.hudTimer = 0;
      this.renderHUD();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 8) {
      this.saveTimer = 0;
      void saveState(this.state);
    }
    this.dialogRefreshTimer += dt;
    if (this.dialogRefreshTimer > 1) {
      this.dialogRefreshTimer = 0;
      this.dialogRefresh?.();
    }
  }

  // ---- 입력 ----
  private setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.downInfo = null;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) {
          this.renderer.cam.zoom = Math.max(0.35, Math.min(2.4, this.renderer.cam.zoom * (d / this.pinchDist)));
        }
        this.pinchDist = d;
        return;
      }

      if (this.downInfo && Math.hypot(e.clientX - this.downInfo.x, e.clientY - this.downInfo.y) > 10) {
        this.downInfo.moved = true;
      }

      // 배치/이동 모드에서는 드래그로 고스트 이동
      if ((this.placing || this.movingUid !== null) && this.downInfo?.moved) {
        const t = this.renderer.unproject(e.clientX, e.clientY);
        const mb = this.movingUid !== null ? this.state.buildings.find((b) => b.uid === this.movingUid) : null;
        const size = this.placing ? BUILDINGS[this.placing.id].size : mb ? BUILDINGS[mb.id].size : 1;
        const x = Math.max(1, Math.min(GRID - 1 - size, Math.round(t.x - size / 2)));
        const y = Math.max(1, Math.min(GRID - 1 - size, Math.round(t.y - size / 2)));
        if (this.placing) { this.placing.x = x; this.placing.y = y; }
        else if (mb) this.moveGhost = { x, y };
        this.renderMoveInfo();
        return;
      }

      if (this.downInfo?.moved) {
        // 카메라 팬
        const z = this.renderer.cam.zoom;
        const dtx = dx / (44 * z) + dy / (22 * z);
        const dty = -dx / (44 * z) + dy / (22 * z);
        this.renderer.cam.x -= dtx;
        this.renderer.cam.y -= dty;
        this.renderer.cam.x = Math.max(-6, Math.min(GRID + 6, this.renderer.cam.x));
        this.renderer.cam.y = Math.max(-6, Math.min(GRID + 6, this.renderer.cam.y));
      }
    });

    const endPointer = (e: PointerEvent) => {
      const wasTap = this.downInfo && !this.downInfo.moved && performance.now() - this.downInfo.t < 400 && this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (wasTap) this.handleTap(e.clientX, e.clientY);
      if (this.pointers.size === 0) this.downInfo = null;
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.downInfo = null;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      this.renderer.cam.zoom = Math.max(0.35, Math.min(2.4, this.renderer.cam.zoom * f));
    }, { passive: false });
  }

  private moveGhost: { x: number; y: number } | null = null;

  private placingValid(): boolean {
    if (this.placing) {
      const occ = occupiedCells(this.state);
      return canPlaceAt(occ, BUILDINGS[this.placing.id].size, this.placing.x, this.placing.y);
    }
    return false;
  }

  private handleTap(sx: number, sy: number): void {
    if (this.mode === 'battle') {
      this.battleTap(sx, sy);
      return;
    }
    const t = this.renderer.unproject(sx, sy);

    // 배치 모드: 탭한 위치로 고스트 이동
    if (this.placing) {
      const size = BUILDINGS[this.placing.id].size;
      this.placing.x = Math.max(1, Math.min(GRID - 1 - size, Math.round(t.x - size / 2)));
      this.placing.y = Math.max(1, Math.min(GRID - 1 - size, Math.round(t.y - size / 2)));
      this.renderMoveInfo();
      return;
    }
    if (this.movingUid !== null) {
      const gb = this.state.buildings.find((b) => b.uid === this.movingUid)!;
      const size = BUILDINGS[gb.id].size;
      this.moveGhost = {
        x: Math.max(1, Math.min(GRID - 1 - size, Math.round(t.x - size / 2))),
        y: Math.max(1, Math.min(GRID - 1 - size, Math.round(t.y - size / 2))),
      };
      this.renderMoveInfo();
      return;
    }

    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    // 건물 히트 테스트 (그려지는 순서 역순 — 깊이 큰 것 우선)
    const hits = this.state.buildings
      .filter((b) => {
        const size = BUILDINGS[b.id].size;
        return tx >= b.x && tx < b.x + size && ty >= b.y && ty < b.y + size;
      })
      .sort((a, b) => b.x + b.y - (a.x + a.y));
    if (hits.length > 0) {
      const b = hits[0];
      this.selected = { kind: 'b', uid: b.uid };
      // 수집기 즉시 수확
      const def = BUILDINGS[b.id];
      if (def.cat === 'resource' && b.lv >= 1 && collectorStored(b, Date.now()) >= 1) {
        const got = collect(this.state, b.uid);
        if (got > 0) this.toast(`+${fmtNum(got)} ${RES_NAMES[def.resType!]}`);
      }
      this.renderInfoPanel();
      return;
    }
    const oHits = this.state.obstacles.filter((o) => {
      const size = o.kind >= 4 ? 2 : 1;
      return tx >= o.x && tx < o.x + size && ty >= o.y && ty < o.y + size;
    });
    if (oHits.length > 0) {
      this.selected = { kind: 'o', uid: oHits[0].uid };
      this.renderInfoPanel();
      return;
    }
    this.selected = null;
    this.renderInfoPanel();
  }

  private battleTap(sx: number, sy: number): void {
    const ctx = this.battleCtx;
    if (!ctx || ctx.battle.over || !ctx.selected) return;
    const t = this.renderer.unproject(sx, sy);
    if (t.x < 0 || t.y < 0 || t.x >= GRID || t.y >= GRID) return;
    const id = ctx.selected;
    if (TROOPS[id]) {
      if ((ctx.armyRemaining[id] ?? 0) <= 0) return;
      const lv = this.state.research[id] ?? 1;
      if (ctx.battle.deploy(id, lv, t.x, t.y)) {
        ctx.armyRemaining[id]--;
        this.state.army[id] = Math.max(0, (this.state.army[id] ?? 0) - 1);
        if (ctx.armyRemaining[id] <= 0) {
          ctx.selected = this.nextDeployable(ctx);
        }
        this.checkArmyEmpty(ctx);
        this.renderHUD();
      } else {
        this.toast('여기엔 배치할 수 없습니다 (빨간 구역)');
      }
    } else if (SPELLS[id]) {
      if ((ctx.spellsRemaining[id] ?? 0) <= 0) return;
      const lv = this.state.research[id] ?? 1;
      if (ctx.battle.castSpell(id, lv, t.x, t.y)) {
        ctx.spellsRemaining[id]--;
        this.state.spells[id] = Math.max(0, (this.state.spells[id] ?? 0) - 1);
        if (ctx.spellsRemaining[id] <= 0) ctx.selected = this.nextDeployable(ctx);
        this.checkArmyEmpty(ctx);
        this.renderHUD();
      }
    }
  }

  private nextDeployable(ctx: BattleCtx): string | null {
    for (const [id, n] of Object.entries(ctx.armyRemaining)) if (n > 0) return id;
    for (const [id, n] of Object.entries(ctx.spellsRemaining)) if (n > 0) return id;
    return null;
  }

  private checkArmyEmpty(ctx: BattleCtx): void {
    const anyLeft = Object.values(ctx.armyRemaining).some((n) => n > 0) || Object.values(ctx.spellsRemaining).some((n) => n > 0);
    if (!anyLeft) ctx.battle.armyEmpty = true;
  }

  // ---- HUD ----
  private renderHUD(): void {
    if (this.mode === 'battle' && this.battleCtx) {
      this.renderBattleHUD();
      return;
    }
    const s = this.state;
    const th = thLevel(s);
    const now = Date.now();
    const shieldRemain = Math.max(0, s.shieldUntil - now);
    const war = s.war;
    const darkRow = th >= 7
      ? `<div class="res-pill"><span class="res-dot" style="background:${RES_COLORS.dark}"></span>${fmtNum(s.dark)}<span class="res-sub">/${fmtNum(storageCap(s, 'dark'))}</span></div>`
      : '';
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="res-col">
          <div class="res-pill"><span class="res-dot" style="background:${RES_COLORS.gold}"></span>${fmtNum(s.gold)}<span class="res-sub">/${fmtNum(storageCap(s, 'gold'))}</span></div>
          <div class="res-pill"><span class="res-dot" style="background:${RES_COLORS.elixir}"></span>${fmtNum(s.elixir)}<span class="res-sub">/${fmtNum(storageCap(s, 'elixir'))}</span></div>
          ${darkRow}
          <div class="res-pill"><span class="res-dot" style="background:${RES_COLORS.gems}"></span>${fmtNum(s.gems)}</div>
        </div>
        <div class="stat-col">
          <div class="res-pill">🏆 ${s.trophies}</div>
          <div class="res-pill">🔨 ${buildersFree(s)}/${builderTotal(s)}</div>
          ${shieldRemain > 0 ? `<div class="res-pill">🛡 ${fmtTime(shieldRemain / 1000)}</div>` : ''}
          ${war && war.phase !== 'ended' ? `<div class="res-pill">⚔️ ${war.phase === 'prep' ? '준비일' : '전쟁일'}</div>` : ''}
        </div>
      </div>
      <div class="hud-bottom">
        <button class="btn red" id="hud-attack">⚔️ 공격</button>
        <button class="btn green" id="hud-shop">🏪 상점</button>
        <button class="btn" id="hud-army">🗡 군대</button>
        <button class="btn gold" id="hud-war">🏰 클랜전</button>
        <button class="btn gray" id="hud-more">⋯</button>
      </div>
    `;
    this.hud.querySelector('#hud-attack')!.addEventListener('click', () => this.openMatchmaking());
    this.hud.querySelector('#hud-shop')!.addEventListener('click', () => this.openShop());
    this.hud.querySelector('#hud-army')!.addEventListener('click', () => this.openArmy('train'));
    this.hud.querySelector('#hud-war')!.addEventListener('click', () => this.openWar());
    this.hud.querySelector('#hud-more')!.addEventListener('click', () => this.openMore());
    this.renderInfoPanelInto();
  }

  private renderBattleHUD(): void {
    const ctx = this.battleCtx!;
    const b = ctx.battle;
    const slots = Object.entries(ctx.armyRemaining)
      .filter(([id]) => TROOPS[id])
      .map(([id, n]) => `
        <div class="deploy-slot ${ctx.selected === id ? 'active' : ''} ${n <= 0 ? 'empty' : ''}" data-id="${id}">
          <div class="cnt">${n}</div>${TROOPS[id].name}
        </div>`);
    const spellSlots = Object.entries(ctx.spellsRemaining)
      .filter(([id]) => SPELLS[id])
      .map(([id, n]) => `
        <div class="deploy-slot ${ctx.selected === id ? 'active' : ''} ${n <= 0 ? 'empty' : ''}" data-id="${id}">
          <div class="cnt">${n}</div>${SPELLS[id].name}
        </div>`);
    this.hud.innerHTML = `
      <div class="battle-top">
        <div class="battle-stats">
          ⏱ ${Math.ceil(b.timeLeft)}초 &nbsp; ${'★'.repeat(b.stars)}${'☆'.repeat(3 - b.stars)} &nbsp; ${b.destruction}%<br>
          <span class="gold-t">+${fmtNum(b.lootGained.gold)}</span> <span class="elixir-t">+${fmtNum(b.lootGained.elixir)}</span>
          ${b.lootGained.dark > 0 ? `<span style="color:#cbb6ff">+${fmtNum(b.lootGained.dark)}</span>` : ''}
        </div>
        <button class="btn red small" id="battle-end">${b.started ? '전투 종료' : '후퇴'}</button>
      </div>
      <div class="deploy-bar">${slots.join('')}${spellSlots.join('')}</div>
    `;
    this.hud.querySelector('#battle-end')!.addEventListener('click', () => {
      if (!b.over) {
        b.over = true;
        b.endReason = b.started ? '전투 종료' : '후퇴';
        if (!b.started) {
          // 병력 배포 전 후퇴 — 결과 없음
          this.battleCtx!.resultShown = true;
          this.exitBattle(false);
        }
      }
    });
    this.hud.querySelectorAll('.deploy-slot').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!;
        const remaining = TROOPS[id] ? ctx.armyRemaining[id] : ctx.spellsRemaining[id];
        if ((remaining ?? 0) > 0) {
          ctx.selected = id;
          this.renderHUD();
        }
      });
    });
  }

  // ---- 정보 패널 ----
  private renderInfoPanelInto(): void {
    if (this.mode !== 'village') return;
    const existing = document.getElementById('info-panel');
    existing?.remove();
    if (this.placing || this.movingUid !== null) {
      this.renderMoveInfo();
      return;
    }
    if (!this.selected) return;
    const panel = document.createElement('div');
    panel.id = 'info-panel';
    this.hud.appendChild(panel);
    this.infoPanel = panel;
    this.fillInfoPanel(panel);
  }

  private renderInfoPanel(): void {
    this.renderInfoPanelInto();
  }

  private fillInfoPanel(panel: HTMLElement): void {
    const s = this.state;
    const now = Date.now();
    if (this.selected?.kind === 'o') {
      const o = s.obstacles.find((x) => x.uid === this.selected!.uid);
      if (!o) { panel.remove(); return; }
      const { res, cost, time } = obstacleClearCost(o.kind);
      const name = o.kind >= 4 ? '바위' : '나무';
      panel.innerHTML = `
        <h3>${name}</h3>
        <div class="muted">제거하면 가끔 젬을 발견합니다</div>
        <div class="btn-row">
          ${o.clearEnd && o.clearEnd > now
            ? `<span class="muted">제거 중... ${fmtTime((o.clearEnd - now) / 1000)}</span>`
            : `<button class="btn green small" id="ip-clear">제거 (${fmtNum(cost)} ${RES_NAMES[res]}, ${fmtTime(time)})</button>`}
        </div>`;
      panel.querySelector('#ip-clear')?.addEventListener('click', () => {
        if (buildersFree(s) <= 0) { this.toast('건설업자가 없습니다'); return; }
        if (!clearObstacle(s, o.uid)) this.toast('자원이 부족합니다');
        this.renderInfoPanel();
      });
      return;
    }
    const b = s.buildings.find((x) => x.uid === this.selected?.uid);
    if (!b) { panel.remove(); return; }
    const def = BUILDINGS[b.id];
    const working = b.upEnd && b.upEnd > now;
    const level = def.levels[Math.max(0, b.lv - 1)];
    let statLine = `HP ${fmtNum(level.hp)}`;
    if (level.dps) statLine += ` · DPS ${level.dps}`;
    if (level.cap && def.cat !== 'army') statLine += ` · 용량 ${fmtNum(level.cap)}`;
    if (level.prod) statLine += ` · 생산 ${fmtNum(level.prod)}/시간`;

    let html = `<h3>${def.name} ${b.lv >= 1 ? `레벨 ${b.lv}` : '(건설 중)'}</h3><div class="muted">${statLine}</div>`;
    if (working) {
      const remain = (b.upEnd! - now) / 1000;
      const gems = gemFinishCost(remain);
      html += `<div class="muted">⏳ ${b.lv < 1 ? '건설' : '업그레이드'} 완료까지 ${fmtTime(remain)}</div>
        <div class="btn-row"><button class="btn gold small" id="ip-finish">💎 즉시 완료 (${gems}젬)</button></div>`;
    } else {
      const th = thLevel(s);
      const maxLv = def.maxLvByTH[th - 1] ?? 0;
      const rows: string[] = [];
      if (b.lv < def.levels.length && b.lv >= 1) {
        const next = def.levels[b.lv];
        rows.push(`<button class="btn green small" id="ip-upgrade">⬆ 레벨 ${b.lv + 1} (${fmtNum(next.cost)} ${RES_NAMES[def.costRes]}${next.time > 0 ? `, ${fmtTime(next.time)}` : ''})</button>`);
        if (b.lv >= maxLv) rows[rows.length - 1] = `<span class="muted">업그레이드하려면 타운홀 레벨 ${findThForNextLevel(def, b.lv)} 필요</span>`;
      } else if (b.lv >= def.levels.length) {
        rows.push('<span class="muted">최대 레벨</span>');
      }
      rows.push('<button class="btn small" id="ip-move">↔ 이동</button>');
      html += `<div class="btn-row">${rows.join('')}</div>`;
    }
    panel.innerHTML = html;
    panel.querySelector('#ip-finish')?.addEventListener('click', () => {
      const remain = (b.upEnd! - Date.now()) / 1000;
      const gems = gemFinishCost(remain);
      if (!finishBuildingWithGems(s, b.uid, gems)) this.toast('젬이 부족합니다');
      this.renderInfoPanel();
    });
    panel.querySelector('#ip-upgrade')?.addEventListener('click', () => {
      const check = canUpgrade(s, b);
      if (!check.ok) { this.toast(check.reason!); return; }
      startUpgrade(s, b.uid);
      void saveState(s);
      this.renderInfoPanel();
    });
    panel.querySelector('#ip-move')?.addEventListener('click', () => {
      this.movingUid = b.uid;
      this.moveGhost = { x: b.x, y: b.y };
      this.selected = null;
      this.renderMoveInfo();
    });
  }

  private renderMoveInfo(): void {
    const existing = document.getElementById('info-panel');
    existing?.remove();
    const panel = document.createElement('div');
    panel.id = 'info-panel';
    this.hud.appendChild(panel);

    if (this.placing) {
      const def = BUILDINGS[this.placing.id];
      const valid = this.placingValid();
      panel.innerHTML = `
        <h3>${def.name} 배치</h3>
        <div class="muted">드래그하거나 탭해서 위치 선택</div>
        <div class="btn-row">
          <button class="btn green small" id="mv-ok" ${valid ? '' : 'disabled'}>✔ 확정</button>
          <button class="btn red small" id="mv-cancel">✖ 취소</button>
        </div>`;
      panel.querySelector('#mv-ok')?.addEventListener('click', () => {
        const p = this.placing!;
        if (placeBuilding(this.state, p.id, p.x, p.y)) {
          this.toast(`${BUILDINGS[p.id].name} 건설 시작!`);
          void saveState(this.state);
          // 성벽은 연속 배치
          if (p.id === 'wall' && canBuyBuilding(this.state, 'wall').ok) {
            this.placing = { id: 'wall', x: p.x + 1, y: p.y };
            this.renderMoveInfo();
            return;
          }
          this.placing = null;
          this.renderInfoPanel();
        } else {
          this.toast('이 위치엔 배치할 수 없습니다');
        }
      });
      panel.querySelector('#mv-cancel')?.addEventListener('click', () => {
        this.placing = null;
        this.renderInfoPanel();
      });
      return;
    }

    if (this.movingUid !== null) {
      const b = this.state.buildings.find((x) => x.uid === this.movingUid)!;
      const g = this.moveGhost ?? { x: b.x, y: b.y };
      const occ = occupiedCells(this.state, b.uid);
      const valid = canPlaceAt(occ, BUILDINGS[b.id].size, g.x, g.y);
      panel.innerHTML = `
        <h3>${BUILDINGS[b.id].name} 이동</h3>
        <div class="muted">드래그하거나 탭해서 위치 선택</div>
        <div class="btn-row">
          <button class="btn green small" id="mv-ok" ${valid ? '' : 'disabled'}>✔ 확정</button>
          <button class="btn red small" id="mv-cancel">✖ 취소</button>
        </div>`;
      panel.querySelector('#mv-ok')?.addEventListener('click', () => {
        if (valid) {
          b.x = g.x;
          b.y = g.y;
          void saveState(this.state);
        }
        this.movingUid = null;
        this.moveGhost = null;
        this.renderInfoPanel();
      });
      panel.querySelector('#mv-cancel')?.addEventListener('click', () => {
        this.movingUid = null;
        this.moveGhost = null;
        this.renderInfoPanel();
      });
    }
  }

  // ---- 다이얼로그 공통 ----
  private openDialog(title: string, refresh?: boolean): HTMLElement {
    this.dialogRoot.innerHTML = `
      <div class="dialog-backdrop">
        <div class="dialog">
          <div class="dialog-title"><span>${title}</span><button class="dialog-close">✕</button></div>
          <div class="dialog-body"></div>
        </div>
      </div>`;
    const backdrop = this.dialogRoot.querySelector('.dialog-backdrop')!;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.closeDialog();
    });
    this.dialogRoot.querySelector('.dialog-close')!.addEventListener('click', () => this.closeDialog());
    if (!refresh) this.dialogRefresh = null;
    return this.dialogRoot.querySelector('.dialog-body')!;
  }

  closeDialog(): void {
    this.dialogRoot.innerHTML = '';
    this.dialogRefresh = null;
  }

  // ---- 상점 ----
  private openShop(): void {
    const body = this.openDialog('상점');
    const s = this.state;
    const th = thLevel(s);
    const ids = Object.keys(BUILDINGS);
    const cards = ids.map((id) => {
      const def = BUILDINGS[id];
      const max = def.countByTH[th - 1] ?? 0;
      const cur = buildingCount(s, id);
      if (max === 0) {
        // 미해금 — 다음 해금 TH 표시
        const unlockTh = def.countByTH.findIndex((n) => n > 0) + 1;
        if (unlockTh <= 0 || unlockTh > 10) return '';
        return `<div class="card" style="opacity:.55"><h4>${def.name}</h4><div class="muted">타운홀 ${unlockTh} 필요</div></div>`;
      }
      const { res, cost } = nextBuildCost(s, id);
      const soldOut = cur >= max;
      return `<div class="card">
        <h4>${def.name}</h4>
        <div class="muted">${cur}/${max}개</div>
        ${soldOut
          ? '<div class="muted">모두 건설됨</div>'
          : `<div>${resSpan(res, cost)}</div><button class="btn green" data-buy="${id}">건설</button>`}
      </div>`;
    }).join('');
    body.innerHTML = `<div class="shop-grid">${cards}</div>`;
    body.querySelectorAll('[data-buy]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.buy!;
        const check = canBuyBuilding(s, id);
        if (!check.ok) { this.toast(check.reason!); return; }
        const spot = findFreeSpot(s, BUILDINGS[id].size);
        if (!spot) { this.toast('배치할 공간이 없습니다'); return; }
        this.placing = { id, x: spot.x, y: spot.y };
        this.selected = null;
        this.closeDialog();
        this.renderMoveInfo();
      });
    });
  }

  // ---- 군대 ----
  private openArmy(tab: 'train' | 'spell' | 'lab'): void {
    const body = this.openDialog('군대');
    const s = this.state;
    const render = () => {
      const cap = armyCapacity(s);
      const used = armyUsed(s);
      let inner = `<div class="tabs">
        <button class="tab ${tab === 'train' ? 'active' : ''}" data-tab="train">훈련 (${used}/${cap})</button>
        <button class="tab ${tab === 'spell' ? 'active' : ''}" data-tab="spell">주문</button>
        <button class="tab ${tab === 'lab' ? 'active' : ''}" data-tab="lab">연구</button>
      </div>`;

      if (tab === 'train') {
        const qHtml = s.trainQ.length
          ? `<div class="row"><b>훈련 대기열</b></div>` + s.trainQ.map((q, i) => `
            <div class="row"><span>${TROOPS[q.id].name} <span class="muted">${fmtTime(q.rem)}</span></span>
            <button class="btn red small" data-cancel="${i}">취소</button></div>`).join('')
          : '';
        const troopCards = Object.values(TROOPS).map((t) => {
          const unlocked = troopUnlocked(s, t.id);
          const lv = s.research[t.id] ?? 1;
          const have = s.army[t.id] ?? 0;
          if (!unlocked) {
            return `<div class="card" style="opacity:.55"><h4>${t.name}</h4><div class="muted">${t.barracks === 'barracks' ? '훈련소' : '다크 훈련소'} 레벨 ${t.unlockLv} 필요</div></div>`;
          }
          return `<div class="card">
            <h4>${t.name} <span class="muted">Lv${lv}</span></h4>
            <div class="muted">보유 ${have} · 공간 ${t.housing} · DPS ${t.dps[lv - 1]} · HP ${t.hp[lv - 1]}</div>
            <div>${resSpan(t.costRes, t.cost[lv - 1])} · ${fmtTime(t.trainTime)}</div>
            <button class="btn green" data-train="${t.id}">훈련</button>
          </div>`;
        }).join('');
        inner += qHtml + `<div class="shop-grid" style="margin-top:8px">${troopCards}</div>`;
      } else if (tab === 'spell') {
        const scap = spellCapacity(s);
        if (scap === 0) {
          inner += '<div class="muted">주문 공장을 건설하면 주문을 만들 수 있습니다 (타운홀 5)</div>';
        } else {
          const sq = s.spellQ.length
            ? s.spellQ.map((q) => `<div class="row"><span>${SPELLS[q.id].name} 제조 중 <span class="muted">${fmtTime(q.rem)}</span></span></div>`).join('')
            : '';
          const cards = Object.values(SPELLS).map((sp) => {
            const factory = s.buildings.find((b) => b.id === 'spell_factory' && b.lv >= sp.unlockLv);
            const lv = s.research[sp.id] ?? 1;
            const have = s.spells[sp.id] ?? 0;
            if (!factory) return `<div class="card" style="opacity:.55"><h4>${sp.name}</h4><div class="muted">주문 공장 레벨 ${sp.unlockLv} 필요</div></div>`;
            return `<div class="card">
              <h4>${sp.name} <span class="muted">Lv${lv}</span></h4>
              <div class="muted">보유 ${have} (${spellsUsed(s)}/${scap})</div>
              <div>${resSpan('elixir', sp.cost[lv - 1])} · ${fmtTime(sp.brewTime)}</div>
              <button class="btn green" data-brew="${sp.id}">제조</button>
            </div>`;
          }).join('');
          inner += sq + `<div class="shop-grid" style="margin-top:8px">${cards}</div>`;
        }
      } else {
        // 연구
        const lab = labLevel(s);
        if (lab === 0) {
          inner += '<div class="muted">연구소를 건설하면 유닛을 업그레이드할 수 있습니다 (타운홀 3)</div>';
        } else {
          if (s.labItem) {
            const name = TROOPS[s.labItem]?.name ?? SPELLS[s.labItem]?.name;
            const remain = (s.labUntil - Date.now()) / 1000;
            inner += `<div class="row"><span>🔬 ${name} 연구 중 <span class="muted">${fmtTime(remain)}</span></span>
              <button class="btn gold small" id="lab-finish">💎 ${gemFinishCost(remain)}젬</button></div>`;
          }
          const items = [...Object.values(TROOPS), ...Object.values(SPELLS)].map((item) => {
            const isTroop = 'housing' in item && 'dps' in item;
            const lv = s.research[item.id] ?? 1;
            const maxLv = 'dps' in item ? item.dps.length : item.power.length;
            const unlocked = TROOPS[item.id] ? troopUnlocked(s, item.id) : !!s.buildings.find((b) => b.id === 'spell_factory' && b.lv >= (item as { unlockLv: number }).unlockLv);
            if (!unlocked) return '';
            if (lv >= maxLv) {
              return `<div class="row"><span>${item.name} <span class="muted">Lv${lv} (최대)</span></span></div>`;
            }
            const step = item.research[lv - 1];
            const res: Res = 'researchRes' in item ? item.researchRes : 'elixir';
            return `<div class="row">
              <span>${item.name} <span class="muted">Lv${lv} → ${lv + 1} · 연구소 Lv${step.lab} · ${fmtTime(step.time)}</span></span>
              <button class="btn green small" data-research="${item.id}">${fmtNum(step.cost)} ${RES_NAMES[res]}</button>
            </div>`;
          }).join('');
          inner += items;
        }
      }
      body.innerHTML = inner;

      body.querySelectorAll('[data-tab]').forEach((el) => {
        el.addEventListener('click', () => this.openArmy((el as HTMLElement).dataset.tab as 'train' | 'spell' | 'lab'));
      });
      body.querySelectorAll('[data-train]').forEach((el) => {
        el.addEventListener('click', () => {
          const r = trainTroop(s, (el as HTMLElement).dataset.train!);
          if (!r.ok) this.toast(r.reason!);
          render();
        });
      });
      body.querySelectorAll('[data-cancel]').forEach((el) => {
        el.addEventListener('click', () => {
          cancelTrain(s, Number((el as HTMLElement).dataset.cancel));
          render();
        });
      });
      body.querySelectorAll('[data-brew]').forEach((el) => {
        el.addEventListener('click', () => {
          const r = brewSpell(s, (el as HTMLElement).dataset.brew!);
          if (!r.ok) this.toast(r.reason!);
          render();
        });
      });
      body.querySelectorAll('[data-research]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = (el as HTMLElement).dataset.research!;
          const check = canResearch(s, id);
          if (!check.ok) { this.toast(check.reason!); return; }
          startResearch(s, id);
          render();
        });
      });
      body.querySelector('#lab-finish')?.addEventListener('click', () => {
        const remain = (s.labUntil - Date.now()) / 1000;
        if (spendRes(s, 'gems', gemFinishCost(remain))) {
          s.labUntil = Date.now() - 1;
        } else this.toast('젬이 부족합니다');
        render();
      });
    };
    render();
    this.dialogRefresh = render;
  }

  // ---- 매치메이킹 (약탈 공격) ----
  private currentOpponent: GeneratedBase | null = null;

  private openMatchmaking(): void {
    const s = this.state;
    if (armyUsed(s) === 0 && spellsUsed(s) === 0) {
      this.toast('먼저 군대를 훈련하세요!');
      this.openArmy('train');
      return;
    }
    const th = thLevel(s);
    const cost = SEARCH_COST[th - 1];
    if (!this.currentOpponent) {
      if (!spendRes(s, 'gold', cost)) { this.toast('골드가 부족합니다'); return; }
      this.currentOpponent = generateOpponent(th, s.trophies);
    }
    const body = this.openDialog('상대 검색');
    const render = () => {
      const e = this.currentOpponent!;
      const mul = thLootMultiplier(th, e.th);
      const offer = trophyOffer(s.trophies, e.trophies);
      body.innerHTML = `
        <div class="row"><b>${e.name}</b><span>🏆 ${e.trophies}</span></div>
        <div class="row"><span>타운홀 레벨</span><b>${e.th}</b></div>
        <div class="row"><span>약탈 가능</span><span>
          ${resSpan('gold', Math.floor(e.loot.gold * mul))} ·
          ${resSpan('elixir', Math.floor(e.loot.elixir * mul))}
          ${e.loot.dark > 0 ? ` · ${resSpan('dark', Math.floor(e.loot.dark * mul))}` : ''}
        </span></div>
        ${mul < 1 ? `<div class="muted">타운홀 레벨 차이로 약탈량 ${Math.round(mul * 100)}% 적용</div>` : ''}
        <div class="row"><span>트로피</span><span>승리 +${offer.win} / 패배 -${offer.lose}</span></div>
        <div class="row" style="border:none;margin-top:10px;justify-content:center;gap:10px">
          <button class="btn gray" id="mm-next">다음 상대 (${fmtNum(cost)} 골드)</button>
          <button class="btn red" id="mm-attack">⚔ 공격!</button>
        </div>`;
      body.querySelector('#mm-next')!.addEventListener('click', () => {
        if (!spendRes(s, 'gold', cost)) { this.toast('골드가 부족합니다'); return; }
        this.currentOpponent = generateOpponent(th, s.trophies);
        render();
      });
      body.querySelector('#mm-attack')!.addEventListener('click', () => {
        const enemy = this.currentOpponent!;
        this.currentOpponent = null;
        this.closeDialog();
        this.startBattle(enemy, 'raid', -1);
      });
    };
    render();
  }

  // ---- 전투 ----
  private startBattle(enemy: GeneratedBase, kind: 'raid' | 'war', warMemberIdx: number): void {
    const s = this.state;
    const th = thLevel(s);
    const mul = kind === 'raid' ? thLootMultiplier(th, enemy.th) : 0;
    const loot = {
      gold: Math.floor(enemy.loot.gold * mul),
      elixir: Math.floor(enemy.loot.elixir * mul),
      dark: Math.floor(enemy.loot.dark * mul),
    };
    if (kind === 'raid') s.shieldUntil = 0; // 공격하면 실드 해제 (원작 규칙)
    const battle = new Battle(enemy.buildings, loot);
    this.battleCtx = {
      battle,
      enemy,
      kind,
      warMemberIdx,
      armyRemaining: { ...s.army },
      spellsRemaining: { ...s.spells },
      selected: null,
      resultShown: false,
      acc: 0,
    };
    this.battleCtx.selected = this.nextDeployable(this.battleCtx);
    this.mode = 'battle';
    this.selected = null;
    this.placing = null;
    this.movingUid = null;
    this.closeDialog();
    document.getElementById('info-panel')?.remove();
    this.renderer.cam = { x: GRID / 2, y: GRID / 2, zoom: 0.75 };
    this.renderHUD();
  }

  private finishBattle(): void {
    const ctx = this.battleCtx!;
    const b = ctx.battle;
    const s = this.state;
    const stars = b.stars;
    const destruction = b.destruction;

    let resultHtml = `
      <div class="stars-big">${'★'.repeat(stars)}<span style="opacity:.25">${'★'.repeat(3 - stars)}</span></div>
      <div class="row"><span>파괴율</span><b>${destruction}%</b></div>
      <div class="row"><span>결과</span><b>${b.endReason}</b></div>`;

    if (ctx.kind === 'raid') {
      const entry = applyRaidResult(s, ctx.enemy, { stars, destruction, loot: b.lootGained });
      resultHtml += `
        <div class="row"><span>약탈</span><span>
          ${resSpan('gold', entry.gold)} · ${resSpan('elixir', entry.elixir)}
          ${entry.dark > 0 ? ` · ${resSpan('dark', entry.dark)}` : ''}
        </span></div>
        <div class="row"><span>트로피</span><b>${entry.trophies > 0 ? '+' : ''}${entry.trophies} 🏆</b></div>`;
    } else {
      applyWarAttack(s, ctx.warMemberIdx, stars, destruction);
      resultHtml += `<div class="row"><span>클랜전 공격</span><b>${ctx.enemy.name}에게 ★${stars}</b></div>`;
    }
    resultHtml += `<div style="text-align:center;margin-top:12px"><button class="btn green" id="battle-ok">홈으로</button></div>`;

    const body = this.openDialog(ctx.kind === 'raid' ? '전투 결과' : '클랜전 공격 결과');
    body.innerHTML = resultHtml;
    body.querySelector('#battle-ok')!.addEventListener('click', () => this.exitBattle(true));
    void saveState(s);
  }

  private exitBattle(save: boolean): void {
    this.battleCtx = null;
    this.mode = 'village';
    this.renderer.cam = { x: GRID / 2, y: GRID / 2, zoom: 0.9 };
    this.closeDialog();
    this.renderHUD();
    if (save) void saveState(this.state);
    if (this.state.war && this.state.war.phase !== 'ended') {
      // 전쟁 중이면 전쟁 화면으로 복귀
      if (this.battleCtxWasWar) this.openWar();
    }
    this.battleCtxWasWar = false;
  }

  private battleCtxWasWar = false;

  // ---- 클랜전 ----
  private openWar(): void {
    const body = this.openDialog('클랜전', true);
    const s = this.state;
    const render = () => {
      const war = s.war;
      const now = Date.now();
      if (!war) {
        body.innerHTML = `
          <p>다른 클랜과 전쟁을 벌입니다! (5 vs 5 — 나 + 클랜 동료 4명은 자동 전투)</p>
          <p class="muted">매칭은 원작 규칙대로 트로피가 아닌 <b>전력(전쟁 무게: ${fmtNum(warWeight(s.buildings))})</b> 기준입니다.
          멤버당 공격 2회, 별 수로 승부. 승리 시 보너스 자원!</p>
          <div class="row" style="border:none;justify-content:center;gap:10px;margin-top:10px">
            <button class="btn gold" id="war-start-fast">빠른 전쟁 (준비 10분 + 전쟁 2시간)</button>
            <button class="btn" id="war-start">정식 전쟁 (준비 23시간 + 전쟁 24시간)</button>
          </div>`;
        body.querySelector('#war-start-fast')!.addEventListener('click', () => {
          s.war = startWar(s, true);
          void saveState(s);
          render();
        });
        body.querySelector('#war-start')!.addEventListener('click', () => {
          s.war = startWar(s, false);
          void saveState(s);
          render();
        });
        return;
      }

      const myS = warStars(war.enemyClan);
      const enS = warStars(war.myClan);
      const myD = warDestruction(war.enemyClan).toFixed(1);
      const enD = warDestruction(war.myClan).toFixed(1);
      let phaseLine = '';
      if (war.phase === 'prep') phaseLine = `준비일 — 전쟁 시작까지 ${fmtTime((war.prepEnd - now) / 1000)}`;
      else if (war.phase === 'battle') phaseLine = `전쟁일 — 종료까지 ${fmtTime((war.battleEnd - now) / 1000)}`;
      else phaseLine = war.result === 'win' ? '🎉 승리!' : war.result === 'lose' ? '패배...' : '무승부';

      const attacksLeft = playerAttacksLeft(war);
      const memberRow = (m: (typeof war.myClan)[number], enemySide: boolean, idx: number) => `
        <div class="war-member">
          <b>${m.isPlayer ? '👑 ' : ''}${m.name}</b> <span class="muted">TH${m.th}</span><br>
          <span>${'★'.repeat(m.stars)}${'☆'.repeat(3 - m.stars)}</span> <span class="muted">${m.bestDestruction}%</span>
          ${enemySide && war.phase === 'battle' && attacksLeft > 0 && m.stars < 3
            ? `<button class="btn red" data-war-attack="${idx}">⚔ 공격</button>` : ''}
        </div>`;

      body.innerHTML = `
        <div style="text-align:center;font-weight:900;margin-bottom:6px">${phaseLine}</div>
        <div class="row"><b>우리 클랜 (${s.name}의 클랜)</b><b>${war.enemyClanName}</b></div>
        <div class="row"><span>★ ${myS} · ${myD}%</span><span>★ ${enS} · ${enD}%</span></div>
        ${war.phase === 'battle' ? `<div class="muted" style="text-align:center">내 남은 공격: ${attacksLeft}회</div>` : ''}
        <div class="war-roster" style="margin-top:8px">
          <div>${war.myClan.map((m, i) => memberRow(m, false, i)).join('')}</div>
          <div>${war.enemyClan.map((m, i) => memberRow(m, true, i)).join('')}</div>
        </div>
        ${war.log.length ? `<div style="margin-top:8px"><b>전투 기록</b>${war.log.slice(0, 12).map((l) => `
          <div class="row"><span>${l.enemySide ? '🔴' : '🔵'} ${l.attacker} → ${l.defender}</span><span>★${l.totalStars} ${l.destruction}%</span></div>`).join('')}</div>` : ''}
        ${war.phase === 'ended' ? '<div style="text-align:center;margin-top:10px"><button class="btn green" id="war-close">확인 (전쟁 종료)</button></div>' : ''}
      `;
      body.querySelectorAll('[data-war-attack]').forEach((el) => {
        el.addEventListener('click', () => {
          if (armyUsed(s) === 0 && spellsUsed(s) === 0) {
            this.toast('먼저 군대를 훈련하세요!');
            return;
          }
          const idx = Number((el as HTMLElement).dataset.warAttack);
          const base = warBaseFor(war, idx);
          this.battleCtxWasWar = true;
          this.startBattle(base, 'war', idx);
        });
      });
      body.querySelector('#war-close')?.addEventListener('click', () => {
        s.war = null;
        void saveState(s);
        this.closeDialog();
      });
    };
    render();
    this.dialogRefresh = render;
  }

  // ---- 더보기 ----
  private openMore(): void {
    const body = this.openDialog('메뉴');
    const s = this.state;
    body.innerHTML = `
      <div class="row"><span>📜 전투 기록</span><button class="btn small" id="m-log">보기</button></div>
      <div class="row"><span>🏆 업적</span><button class="btn small" id="m-ach">보기</button></div>
      <div class="row"><span>👤 이름: <b>${s.name}</b></span><button class="btn small" id="m-name">변경</button></div>
      <div class="row"><span>🛡 실드</span><span class="muted">${s.shieldUntil > Date.now() ? fmtTime((s.shieldUntil - Date.now()) / 1000) + ' 남음' : '없음'}</span></div>
      <div class="row"><span>⚖️ 전쟁 무게</span><span class="muted">${fmtNum(warWeight(s.buildings))}</span></div>
      <div class="row"><span>🗑 게임 초기화</span><button class="btn red small" id="m-reset">초기화</button></div>
      <div class="muted" style="margin-top:10px">솔로 클래시 v0.1 — 오프라인 싱글플레이. 모든 데이터는 이 기기에만 저장됩니다.</div>
    `;
    body.querySelector('#m-log')!.addEventListener('click', () => this.openLog());
    body.querySelector('#m-ach')!.addEventListener('click', () => this.openAchievements());
    body.querySelector('#m-name')!.addEventListener('click', () => {
      const name = prompt('족장 이름을 입력하세요', s.name);
      if (name && name.trim()) {
        s.name = name.trim().slice(0, 12);
        void saveState(s);
      }
      this.openMore();
    });
    body.querySelector('#m-reset')!.addEventListener('click', () => {
      if (confirm('정말 처음부터 다시 시작할까요? 모든 진행 상황이 사라집니다.')) {
        localStorage.removeItem('solo-clash-save-v1');
        indexedDB.deleteDatabase('solo-clash');
        location.reload();
      }
    });
  }

  private openLog(): void {
    const body = this.openDialog('전투 기록');
    const s = this.state;
    if (s.log.length === 0) {
      body.innerHTML = '<div class="muted">아직 기록이 없습니다.</div>';
      return;
    }
    body.innerHTML = s.log.map((l) => `
      <div class="row">
        <span>${l.kind === 'attack' ? '⚔️' : '🛡'} ${l.enemy}<br>
          <span class="muted">${new Date(l.ts).toLocaleString('ko-KR')} · ★${l.stars} · ${l.destruction}%</span></span>
        <span style="text-align:right">${l.kind === 'attack' ? '+' : '-'}${fmtNum(l.gold)}G ${l.kind === 'attack' ? '+' : '-'}${fmtNum(l.elixir)}E<br>
          <span class="muted">${l.trophies > 0 ? '+' : ''}${l.trophies} 🏆</span></span>
      </div>`).join('');
  }

  private openAchievements(): void {
    const body = this.openDialog('업적');
    const s = this.state;
    body.innerHTML = ACHIEVEMENTS.map((a) => {
      const claimed = s.achieved[a.id] ?? 0;
      const value = a.metric(s);
      const next = a.tiers[Math.min(claimed, a.tiers.length - 1)];
      const done = claimed >= a.tiers.length;
      return `<div class="row">
        <span>${a.name} <span class="muted">${'⭐'.repeat(claimed)}</span><br>
          <span class="muted">${done ? '완료!' : `${fmtNum(value)} / ${fmtNum(next.goal)} (보상 ${next.gems}젬)`}</span></span>
      </div>`;
    }).join('');
  }
}

function findThForNextLevel(def: (typeof BUILDINGS)[string], curLv: number): number {
  for (let th = 1; th <= 10; th++) {
    if ((def.maxLvByTH[th - 1] ?? 0) > curLv) return th;
  }
  return 10;
}
