#!/usr/bin/env node
import prompts from 'prompts';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

async function main() {
  const response = await prompts([
    {
      type: 'text',
      name: 'url',
      message: 'Enter YouTube video or playlist URL:',
    },
    {
      type: 'text',
      name: 'outDir',
      message: 'Output base folder (will create outputs/ inside this):',
      initial: process.cwd(),
    },
  ], { onCancel: () => { console.log('Cancelled'); process.exit(1); } });

  const { url, outDir } = response;
  if (!url) {
    console.error('No URL provided');
    process.exit(2);
  }
  const resolved = path.resolve(outDir || process.cwd());
  try { fs.mkdirSync(resolved, { recursive: true }); } catch (e) {}

  console.log(`Running extractor for: ${url}`);
  console.log(`Saving outputs under: ${path.join(resolved, 'outputs')}`);

  const node = process.execPath || 'node';
  const script = path.join(process.cwd(), 'scripts', 'playlist-extract.js');
  const child = spawn(node, [script, url], { stdio: 'inherit', cwd: resolved });
  child.on('close', (code) => {
    if (code === 0) process.exit(0);
    console.error(`Extractor exited with code ${code}`);
    process.exit(code ?? 1);
  });
}

main();
