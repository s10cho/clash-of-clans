import { defineConfig } from 'vite';

// base './' — GitHub Pages 프로젝트 페이지(/repo-name/) 서브패스에서도 동작
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});
