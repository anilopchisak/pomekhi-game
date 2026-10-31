import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { tunaExecutable, tunaLaunch, requireLocalApp } from '../../scripts/tuna.mjs';

describe('Tuna launch boundary', () => {
  it('uses the configured application port and disables traffic-body inspection', () => {
    const launch = tunaLaunch({ PORT: '4567' });
    expect(launch.args).toEqual(['http', 'http://127.0.0.1:4567', '--inspect=false', '--qr', '--no-colors']);
  });
  it('rejects an ephemeral port before opening a tunnel', () => {
    expect(() => tunaLaunch({ PORT: '0' })).toThrow('fixed positive PORT');
  });
  it('passes an explicitly configured assigned subdomain as a separate argument', () => {
    expect(tunaLaunch({ TUNA_SUBDOMAIN: 'assigned-free-1234' }).args.slice(-2)).toEqual(['--subdomain', 'assigned-free-1234']);
  });
  it('rejects a URL or command string in place of a subdomain', () => {
    expect(() => tunaLaunch({ TUNA_SUBDOMAIN: 'https://example.test --flag' })).toThrow('assigned subdomain name');
  });
  it('maps wildcard binding addresses to usable loopback upstreams', () => {
    expect(tunaLaunch({ HOST: '0.0.0.0' }).origin).toBe('http://127.0.0.1:3000');
    expect(tunaLaunch({ HOST: '::' }).origin).toBe('http://[::1]:3000');
  });
  it('keeps an executable path with spaces as one path rather than a shell command', () => {
    expect(tunaExecutable({ TUNA_BIN: './my tools/tuna' })).toBe(resolve('my tools/tuna'));
  });
  it('selects a Windows .exe when resolving a project-local client', () => {
    const selected = tunaExecutable({}, { platform: 'win32', exists: () => true });
    expect(selected).toMatch(/tuna\.exe$/);
  });
  it('uses a PATH-installed client when no local binary exists', () => {
    expect(tunaExecutable({}, { exists: () => false })).toBe('tuna');
  });
  it('gives a normalized failure for an invalid upstream instead of exposing transport details', async () => {
    await expect(requireLocalApp('not a URL')).rejects.toThrow('Start the application first');
  });
});
