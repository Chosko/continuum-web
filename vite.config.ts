import { defineConfig } from 'vite';

// base './' so the build works both at https://chosko.github.io/continuum-web/
// and at https://continuum.chosko.com/ (custom domain via public/CNAME).
export default defineConfig({
  base: './',
  build: {
    // Safari 14 / iOS 14+ and older Android WebViews: lower ES2021+ syntax (??=, etc.).
    target: ['es2020', 'safari14', 'firefox90', 'chrome90'],
    assetsInlineLimit: 0,
  },
});
