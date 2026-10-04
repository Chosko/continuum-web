import { defineConfig } from 'vite';

// base './' so the build works both at https://chosko.github.io/continuum-web/
// and at https://continuum.chosko.com/ (custom domain via public/CNAME).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
