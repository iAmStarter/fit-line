/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts', // GAS entry point — covered by contract/E2E, not unit
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // ts-jest reads tsconfig.json (es5/esnext). Tests run under Node CJS.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Override for the test runtime only: emit CommonJS so Jest can
          // require() the compiled modules. Source build (Rollup) still uses
          // esnext modules. Keep strict + es5 lib semantics elsewhere.
          module: 'commonjs',
          esModuleInterop: true,
          // Tests import stub bodies that reference GAS globals only at call
          // time; do not fail the transform on unused params in test helpers.
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
};
