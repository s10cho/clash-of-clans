import './style.css';
import { loadState, newGame } from './state';
import { Game } from './ui';

async function boot(): Promise<void> {
  const state = (await loadState()) ?? newGame();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const game = new Game(state, canvas);

  let last = performance.now();
  const loop = (t: number): void => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    game.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 서비스 워커 등록 (프로덕션만 — GitHub Pages 서브패스에서도 상대 경로로 동작)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    } catch {
      // 오프라인 설치는 선택 사항 — 실패해도 게임은 동작
    }
  }
}

void boot();
