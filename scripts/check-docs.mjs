import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { projectRoot } from './runtime.mjs';

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(path);
  }
  return result;
}
const roots = (await readdir(projectRoot)).filter(name => name.endsWith('.md')).map(name => resolve(projectRoot, name));
const files = [...roots, ...await markdownFiles(resolve(projectRoot, 'docs')), ...await markdownFiles(resolve(projectRoot, '.agents'))];
const errors = [];
for (const path of files) {
  const text = await readFile(path, 'utf8');
  const name = relative(projectRoot, path);
  if (/TODO_ADAPT/.test(text)) errors.push(`${name}: unfinished template marker`);
  if (/[\u0400-\u04ff]/u.test(text)) errors.push(`${name}: documentation must be in English`);
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');
  for (const match of withoutCode.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) continue;
    const resolved = resolve(dirname(path), target);
    if (relative(projectRoot, resolved).startsWith('..')) {
      errors.push(`${name}: link leaves the project: ${target}`);
      continue;
    }
    try { await stat(resolved); }
    catch { errors.push(`${name}: missing link target: ${target}`); }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS ${files.length} English Markdown documents, local links and template markers`);
