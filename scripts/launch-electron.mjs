import { spawn } from 'node:child_process';
import electronPath from 'electron';

// VS Code may export ELECTRON_RUN_AS_NODE to every integrated process.
// Remove it completely so Electron starts its desktop runtime, not Node.js.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('error', (error) => {
  console.error('Unable to launch Electron:', error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
