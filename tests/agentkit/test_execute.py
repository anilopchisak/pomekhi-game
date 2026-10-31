"""Verify command output and timeout cleanup through the real npm launcher."""
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/agentkit'))
from agent import execute


class ExecuteTests(unittest.TestCase):
    def test_preserves_command_status_and_combined_output(self):
        code, output = execute([sys.executable, '-c',
                                'import sys; print("output", flush=True); '
                                'print("error", file=sys.stderr); sys.exit(7)'])
        self.assertEqual(code, 7)
        self.assertEqual(output, 'output\nerror\n')

    def test_missing_executable_returns_actionable_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            code, output = execute([str(Path(directory) / 'missing')])
        self.assertEqual(code, 127)
        self.assertIn('Cannot start executable', output)

    def test_timeout_releases_resources_held_by_npm_descendant(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            for name in ('runtime.mjs', 'run-npm.mjs'):
                shutil.copyfile(ROOT / 'scripts' / name, root / 'scripts' / name)
            shutil.copyfile(ROOT / '.nvmrc', root / '.nvmrc')
            (root / 'package.json').write_text(json.dumps({
                'scripts': {'probe': 'node probe.mjs'},
            }), encoding='utf-8')
            (root / 'probe.mjs').write_text(
                "import { createServer } from 'node:net';\n"
                "const server = createServer();\n"
                "process.on('SIGTERM', () => {});\n"
                "server.listen(0, '127.0.0.1', () => {\n"
                "  console.log('PROBE ' + JSON.stringify({ pid: process.pid, port: server.address().port }));\n"
                "});\n", encoding='utf-8')
            code, output = execute([shutil.which('node'), 'scripts/run-npm.mjs', 'probe'],
                                   timeout=2, cwd=root)
            probes = [json.loads(line[6:]) for line in output.splitlines()
                      if line.startswith('PROBE ')]
            self.assertEqual(len(probes), 1, output)
            probe = probes[0]
            released = False
            try:
                self.assertEqual(code, 124, output)
                self.assertIn('Command exceeded its timeout.', output)
                with socket.socket() as reservation:
                    reservation.bind(('127.0.0.1', probe['port']))
                released = True
            finally:
                # Also clean the descendant when this test exposes the old bug.
                if not released:
                    if os.name == 'nt':
                        import subprocess
                        subprocess.run(['taskkill', '/PID', str(probe['pid']), '/T', '/F'],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        try:
                            os.kill(probe['pid'], signal.SIGKILL)
                        except ProcessLookupError:
                            pass


if __name__ == '__main__':
    unittest.main()
