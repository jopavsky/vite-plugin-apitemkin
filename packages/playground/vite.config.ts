import { defineConfig } from 'vite';
import apitemkin from 'vite-plugin-apitemkin';

export default defineConfig({
  plugins: [apitemkin()],
});
