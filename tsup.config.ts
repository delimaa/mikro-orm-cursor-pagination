import { defineConfig } from 'tsup';

export default defineConfig({
  dts: true,
  bundle: false,
  treeshake: true,
  clean: true,
  format: ['esm', 'cjs'],
  entry: ['src/**/*.ts'],
});
