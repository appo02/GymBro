#!/usr/bin/env node
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function findYtDlp() {
  const local = path.join(PROJECT_ROOT, 'yt-dlp.exe');
  try {
    if (fs.existsSync(local)) return local;
  } catch {}
  return 'yt-dlp';
}

function sanitizeName(name) {
  return name.replace(/[<>:\"/\\|?*]/g, '').trim().replace(/\s+/g, ' ');
}

function runYtDlpJson(ytDlpPath, args) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      if (child.stdout) {
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => (stdout += chunk));
      }
      if (child.stderr) {
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => (stderr += chunk));
      }
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(stderr || `yt-dlp exited ${code}`));
        resolve({ stdout, stderr });
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function listPlaylistEntries(ytDlpPath, url) {
  // ask yt-dlp for JSON with --flat-playlist so output is manageable
  const { stdout } = await runYtDlpJson(ytDlpPath, ['-J', '--flat-playlist', url]);
  // try parse as full JSON (has entries) first
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
      return { info: parsed, entries: parsed.entries };
    }
  } catch {
    // fallthrough to try newline-delimited JSON
  }
  // fallback: split by lines and parse each JSON line (flat playlist sometimes emits line-per-entry)
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      // if this looks like a playlist top-object, capture title
      if (obj && obj._type === 'playlist' && Array.isArray(obj.entries)) {
        return { info: obj, entries: obj.entries };
      }
      entries.push(obj);
    } catch {
      // ignore non-json lines
    }
  }
  if (entries.length > 0) return { info: null, entries };
  // nothing useful
  return { info: null, entries: null };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function uniqueFilePath(dir, baseName, ext) {
  let candidate = path.join(dir, `${baseName}${ext}`);
  if (!fs.existsSync(candidate)) return candidate;
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName} (${i})${ext}`);
    i++;
  }
  return candidate;
}

function runCliForVideo(videoUrl) {
  // run the built CLI using absolute path from project root
  const nodePath = process.execPath || 'node';
  const cliPath = path.join(PROJECT_ROOT, 'dist', 'cli.js');
  const args = [cliPath, videoUrl, '--extract', '--timestamps'];
  const res = spawnSync(nodePath, args, { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(res.stderr || `CLI failed for ${videoUrl}`);
  return res.stdout;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node scripts/playlist-extract.js <playlist-or-video-url> [--output <dir>]');
    process.exit(2);
  }

  // Parse args: first positional is URL, optional --output <dir>
  let inputUrl = null;
  let outputBase = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--output' && argv[i + 1]) {
      outputBase = argv[++i];
    } else if (!inputUrl) {
      inputUrl = argv[i];
    }
  }
  if (!inputUrl) {
    console.error('No URL provided');
    process.exit(2);
  }
  // Default output base to project root
  const outputRoot = outputBase ? path.resolve(outputBase) : PROJECT_ROOT;
  const ytDlp = findYtDlp();

  let info = null;
  let entries = null;
  try {
    const listed = await listPlaylistEntries(ytDlp, inputUrl);
    info = listed.info;
    entries = listed.entries;
  } catch (err) {
    console.error('yt-dlp failed to fetch metadata:', String(err.message || err));
    process.exit(1);
  }

  let baseDirName = info && (info.title || info.fulltitle) ? info.title || info.fulltitle : null;

  if (!baseDirName) {
    // fallback to id or sanitized url
    baseDirName = inputUrl.replace(/[:\\/?#&=]/g, '-');
  }

  const baseDir = path.join(outputRoot, 'outputs', sanitizeName(baseDirName));
  ensureDir(baseDir);

  // combined transcripts file for the whole playlist/video
  const combinedFile = path.join(baseDir, 'all_transcripts.txt');
  // start fresh
  try { fs.writeFileSync(combinedFile, '', 'utf8'); } catch {}

  if (!entries) {
    // single video
    const title = info.title || info.fulltitle || info.id || 'video';
    const safe = sanitizeName(title) || info.id || 'video';
    const filePath = path.join(baseDir, `${safe}.txt`);
    console.log(`Processing single video: ${title}`);
    try {
      const out = runCliForVideo(inputUrl);
      fs.writeFileSync(filePath, out, 'utf8');
      // append to combined
      try {
        fs.appendFileSync(combinedFile, `=== ${title} ===\nURL: ${inputUrl}\n\n` + out + "\n\n", 'utf8');
      } catch {}
      console.log(`Saved ${filePath}`);
    } catch (err) {
      console.error(`Failed to process video: ${String(err.message || err)}`);
      process.exit(1);
    }
    return;
  }

  console.log(`Processing playlist: ${baseDirName} (${entries.length} entries)`);
  for (const entry of entries) {
    const id = entry.id || entry.video_id || null;
    const webpage = entry.webpage_url || (id ? `https://youtu.be/${id}` : null);
    const title = entry.title || entry.fulltitle || id || 'video';
    const safeName = sanitizeName(title) || id || 'video';
    const outFile = uniqueFilePath(baseDir, safeName, '.txt');
    try {
      console.log(` -> ${title}`);
      if (!webpage) throw new Error('No video URL');
      const out = runCliForVideo(webpage);
      fs.writeFileSync(outFile, out, 'utf8');
      // append to combined file
      try {
        fs.appendFileSync(combinedFile, `=== ${title} ===\nURL: ${webpage}\n\n` + out + "\n\n", 'utf8');
      } catch (err) {
        console.error(`   Failed to append to combined file: ${String(err.message||err)}`);
      }
      console.log(`   Saved ${outFile}`);
    } catch (err) {
      console.error(`   Failed ${title}: ${String(err.message || err)}`);
    }
  }
}

main();
