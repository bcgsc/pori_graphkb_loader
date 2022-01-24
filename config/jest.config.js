// main jest configuration file
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');

module.exports = {
    collectCoverage: true,
    collectCoverageFrom: [
        'src/**.ts',
        'src/**/*.ts',
        'src/**/**/*.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'clover',
        'text',
        'json',
        'json-summary',
        'lcov',
    ],
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.json',
        },
    },
    moduleFileExtensions: [
        'ts', 'js',
    ],
    preset: 'ts-jest',
    reporters: [
        'default',
        [
            'jest-junit',
            {
                output: '<rootDir>/coverage/junit.xml',
            },
        ],
    ],
    rootDir: BASE_DIR,
    testEnvironment: 'node',
    testPathIgnorePatterns: [
        '/node_modules/',
    ],
    testRegex: 'test/.*\\.ts',
    testRunner: 'jest-circus/runner',
};
