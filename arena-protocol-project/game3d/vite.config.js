import { defineConfig } from 'vite';

// Allow importing the shared movement module that lives one level up
// (../shared) so the client and server can run identical physics.
export default defineConfig({
  // Relative asset URLs let the production build run from GitHub Pages subfolders.
  base: './',
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
