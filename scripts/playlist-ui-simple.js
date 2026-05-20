#!/usr/bin/env node
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

(async () => {
  try {
    const argv = process.argv.slice(2);
    const url = (argv[0] && argv[0].trim()) || (await ask('Enter YouTube video or playlist URL: ')).trim();
    if (!url) { console.error('No URL provided'); process.exit(2); }
    const defaultDir = process.cwd();
    const out = (argv[1] && argv[1].trim()) || (await ask(`Output base folder (default: ${defaultDir}): `)).trim() || defaultDir;
    const resolved = path.resolve(out);
    fs.mkdirSync(resolved, { recursive: true });

    console.log(`Running extractor for: ${url}`);
    console.log(`Saving outputs under: ${path.join(resolved, 'outputs')}`);

    const node = process.execPath || 'node';
    const script = path.join(process.cwd(), 'scripts', 'playlist-extract.js');
    const child = spawn(node, [script, url], { stdio: 'inherit', cwd: resolved });
    child.on('close', (code) => process.exit(code || 0));
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
