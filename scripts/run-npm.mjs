import { runNpm } from './runtime.mjs';

const script = process.argv[2];
if (!script) throw new Error('Specify a package.json script.');
process.exitCode = runNpm(script, process.argv.slice(3));
