export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/config/env.js'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 70,
      statements: 70
    },
    './src/services/': {
      branches: 60,
      functions: 70,
      lines: 75,
      statements: 75
    }
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    'test.js$'
  ],
  testTimeout: 10000,
  bail: false,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true
};
