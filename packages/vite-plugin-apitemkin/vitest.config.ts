import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The HMR suite races chokidar 'add' / 'change' events against a
    // budget. Under parallel-test load on Windows, that latency can
    // climb well past 5 seconds. Bump generously — every non-HMR file
    // finishes in < 2s, and HMR's own internal pollFetch timeouts fire
    // before this would, so the extra ceiling only matters on the
    // pathological cases.
    testTimeout: 60_000,
    // Run test FILES sequentially. Tests within a file still run as
    // configured, but no two files share the OS at once. We saw the HMR
    // suite flake under concurrent load with several other files
    // creating their own Vite dev servers + chokidar watchers — the
    // kernel file-watcher pressure delayed `add` events well past any
    // reasonable polling budget. Cost is ~3s of added wall time on a
    // full suite run; benefit is a deterministic publish gate.
    fileParallelism: false,
  },
});
