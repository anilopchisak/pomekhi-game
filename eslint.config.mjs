import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

const clientDependency = { regex: '(^|/)client(/|$)', message: 'Keep browser code inside the client.' };
const serverDependency = { regex: '(^|/)server(/|$)', message: 'Keep server implementations out of browser and shared code.' };
const nodeDependency = { regex: '^node:', message: 'Use environment-neutral modules outside the server.' };
const nodeModules = [...new Set(builtinModules.filter(name => !name.startsWith('node:')))];
const clientPatterns = [serverDependency, nodeDependency];

function clientImports(additional = []) {
  return ['error', { paths: nodeModules, patterns: [...clientPatterns, ...additional] }];
}

export default [
  { ignores: ['node_modules/**', 'dist/**', '.runtime/**', '.agent-runtime/**', '.agent-state/**', '.cache/**', 'coverage/**', 'artifacts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{mjs,ts,tsx}'],
    languageOptions: {
      globals: {
        process: 'readonly', console: 'readonly', URL: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        fetch: 'readonly', AbortSignal: 'readonly',
      },
    },
  },
  {
    files: ['src/client/**/*.{ts,tsx,js,jsx,mjs}'],
    rules: { 'no-restricted-imports': clientImports() },
  },
  {
    files: ['src/client/app/**/*.{ts,tsx,js,jsx,mjs}'],
    rules: {
      'no-restricted-imports': clientImports([{
        regex: '(^|/)pages/[^/]+/(?!index\\.js$)',
        message: 'Import a page through its public index.js interface.',
      }]),
    },
  },
  {
    files: ['src/client/pages/**/*.{ts,tsx,js,jsx,mjs}'],
    rules: {
      'no-restricted-imports': clientImports([{
        regex: '(^|/)app(/|$)',
        message: 'Pages are composed by App and cannot import it.',
      }]),
    },
  },
  {
    files: ['src/server/**/*.{ts,js,mjs}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [clientDependency] }] },
  },
  {
    files: ['src/server/transport/**/*.{ts,js,mjs}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [clientDependency, {
        regex: '(^|/)(app|runtime|index)\\.(js|ts|mjs)$',
        message: 'Transport modules receive dependencies; they cannot import server assembly or bootstrap.',
      }] }],
    },
  },
  {
    files: ['src/client/shared/**/*.{ts,tsx,js,jsx,mjs}'],
    rules: { 'no-restricted-imports': clientImports([{
      regex: '(^|/)(app|pages)(/|$)', message: 'Client Shared cannot import upper layers.',
    }]) },
  },
  ...['host', 'player'].map(slice => ({
    files: [`src/client/pages/${slice}/**/*.{ts,tsx,js,jsx,mjs}`],
    rules: { 'no-restricted-imports': clientImports([
      { regex: '(^|/)app(/|$)', message: 'Pages are composed by App and cannot import it.' },
      { regex: `(^|/)${slice === 'host' ? 'player' : 'host'}(/|$)`, message: 'Page slices cannot import each other.' },
      { regex: '(^|/)shared/(api|ui)/(?!index\\.js$)', message: 'Use the public interface of a client Shared segment.' },
    ]) },
  })),
  {
    files: ['src/server/lobby.ts', 'src/server/game.ts', 'src/server/dealing.ts', 'src/server/cards.ts'],
    rules: { 'no-restricted-imports': ['error', {
      paths: ['express', 'socket.io', 'node:http', 'node:net'],
      patterns: [clientDependency, { regex: '(^|/)(transport|app|runtime|index)(/|\\.)', message: 'Lobby owns state independently of transport and bootstrap.' }],
    }] },
  },
  {
    files: ['src/shared/**/*.{ts,js,mjs}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: nodeModules,
        patterns: [clientDependency, serverDependency, nodeDependency],
      }],
    },
  },
];
