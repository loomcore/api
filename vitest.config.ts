import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [],
  test: {
    environment: 'node',
    globals: true,
    // Postgres tests share one Docker DB; run in single worker so init/migrations run once
    pool: process.env.TEST_DATABASE === 'postgres' ? 'forks' : undefined,
    poolOptions: process.env.TEST_DATABASE === 'postgres' ? { forks: { singleFork: true } } : undefined,
    setupFiles: ['src/__tests__/setup/vitest-setup.ts'],
    globalSetup: [],
    include: ['src/**/__tests__/**/*.test.ts?(x)', 'src/**/?(*.)+(test).ts?(x)'],
    exclude: ['**/node_modules/**', '**/__tests__/setup/**/*'],
    testTimeout: 10000, // 10 seconds should be plenty for database operations
    hookTimeout: 10000, // 10 seconds for setup/teardown hooks
    environmentOptions: {
      env: {
        NODE_ENV: 'test'
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/test/']
    },
    root: '.',
    resolveSnapshotPath: (testPath, snapExtension) => 
      testPath.replace(/\.test\.([tj]sx?)$/, `.test${snapExtension}.$1`),
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    conditions: ['import', 'node'],
    mainFields: ['module', 'main']
  }
}); 