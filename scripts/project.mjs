import { runNpm } from './runtime.mjs';

process.exitCode = runNpm(process.argv[2] ?? 'dev', process.argv.slice(3));
