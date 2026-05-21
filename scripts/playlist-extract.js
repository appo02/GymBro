#!/usr/bin/env node
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SSL_CERT_ERR_RE = /CERTIFICATE_VERIFY_FAILED|unable to get local issuer certificate/i;

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

function hasSslCertError(text) {
  return SSL_CERT_ERR_RE.test(String(text || ''));
}

function withNoCheckCertificates(args) {
  if (args.includes('--no-check-certificates')) return args;
  return [...args, '--no-check-certificates'];
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

async function runYtDlpJsonWithFallback(ytDlpPath, args) {
  try {
    return await runYtDlpJson(ytDlpPath, args);
  } catch (err) {
    const message = String(err?.message || err);
    if (!args.includes('--no-check-certificates') && hasSslCertError(message)) {
      console.warn('yt-dlp SSL certificate check failed. Retrying with --no-check-certificates...');
      return runYtDlpJson(ytDlpPath, withNoCheckCertificates(args));
    }
    throw err;
  }
}

function runYtDlpSyncWithFallback(ytDlpPath, args, options) {
  let res = spawnSync(ytDlpPath, args, options);
  const output = `${res?.stderr || ''}\n${res?.stdout || ''}\n${res?.error?.message || ''}`;
  if ((res?.error || res?.status !== 0) && !args.includes('--no-check-certificates') && hasSslCertError(output)) {
    console.warn('yt-dlp SSL certificate check failed. Retrying with --no-check-certificates...');
    res = spawnSync(ytDlpPath, withNoCheckCertificates(args), options);
  }
  return res;
}

async function listPlaylistEntries(ytDlpPath, url) {
  // ask yt-dlp for JSON with --flat-playlist so output is manageable
  const { stdout } = await runYtDlpJsonWithFallback(ytDlpPath, ['-J', '--flat-playlist', url]);
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

function parseVtt(vttContent) {
  // Parse WebVTT into timestamped text lines
  const lines = vttContent.split(/\r?\n/);
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const timeMatch = lines[i].match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (timeMatch) {
      const startTime = timeMatch[1];
      i++;
      let text = '';
      while (i < lines.length && lines[i].trim() !== '') {
        const cleaned = lines[i].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        if (cleaned) text += (text ? ' ' : '') + cleaned;
        i++;
      }
      if (text) {
        segments.push({ time: formatTimestamp(startTime), text });
      }
    } else {
      i++;
    }
  }

  // Deduplicate progressive reveals in auto-subs
  const deduped = [];
  for (let j = 0; j < segments.length; j++) {
    const curr = segments[j];
    const next = segments[j + 1];
    if (next && next.text.startsWith(curr.text)) continue;
    if (deduped.length > 0 && curr.text.startsWith(deduped[deduped.length - 1].text)) {
      deduped[deduped.length - 1] = curr;
    } else if (deduped.length === 0 || deduped[deduped.length - 1].text !== curr.text) {
      deduped.push(curr);
    }
  }
  return deduped;
}

function parseJson3(json3Content) {
  // Parse YouTube json3 subtitle format — gives clean non-overlapping segments
  const data = JSON.parse(json3Content);
  const events = (data.events || []).filter(e => e.segs && e.segs.length > 0);
  const segments = [];

  for (const event of events) {
    const startMs = event.tStartMs || 0;
    const text = event.segs.map(s => s.utf8 || '').join('').trim();
    if (!text || text === '\n') continue;
    const cleaned = text.replace(/\n/g, ' ').trim();
    if (cleaned) {
      segments.push({ time: formatMs(startMs), text: cleaned });
    }
  }
  return segments;
}

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `[${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
  return `[${minutes}:${String(seconds).padStart(2, '0')}]`;
}

function formatTimestamp(vttTime) {
  // Convert 00:01:23.456 -> [01:23] or [1:01:23] for hour+ videos
  const parts = vttTime.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2].split('.')[0], 10);
  if (hours > 0) return `[${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
  return `[${minutes}:${String(seconds).padStart(2, '0')}]`;
}

function extractTranscript(ytDlpPath, videoUrl, tempDir) {
  // Clean temp dir for this video
  const existingFiles = fs.existsSync(tempDir) ? fs.readdirSync(tempDir) : [];
  for (const f of existingFiles) {
    if (f.startsWith('sub_temp')) try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
  }

  const tempBase = path.join(tempDir, 'sub_temp');

  // Try json3 first (clean non-overlapping segments), fall back to vtt
  const args = [
    '--write-subs', '--write-auto-subs',
    '--sub-langs', 'en.*,en',
    '--sub-format', 'json3',
    '--skip-download',
    '--no-playlist',
    '-o', tempBase,
    videoUrl
  ];

  const res = runYtDlpSyncWithFallback(ytDlpPath, args, { encoding: 'utf8', timeout: 120000 });
  if (res.error) throw res.error;

  // Find downloaded subtitle files
  const files = fs.readdirSync(tempDir).filter(f => f.startsWith('sub_temp'));
  const json3File = files.find(f => f.endsWith('.json3'));
  const vttFile = files.find(f => f.endsWith('.vtt'));

  if (!json3File && !vttFile && res.status !== 0) {
    throw new Error(res.stderr || `yt-dlp exited ${res.status}`);
  }

  let segments;
  if (json3File) {
    const content = fs.readFileSync(path.join(tempDir, json3File), 'utf8');
    segments = parseJson3(content);
  } else if (vttFile) {
    const content = fs.readFileSync(path.join(tempDir, vttFile), 'utf8');
    segments = parseVtt(content);
  } else {
    throw new Error('No subtitles/transcript available for this video');
  }

  // Clean up temp files
  for (const f of files) {
    try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
  }

  if (segments.length === 0) throw new Error('Transcript was empty');
  return segments.map(s => `${s.time} ${s.text}`).join('\n');
}

function getTranscriptForVideo(ytDlpPath, videoUrl, tempDir) {
  ensureDir(tempDir);
  return extractTranscript(ytDlpPath, videoUrl, tempDir);
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
  let outputRoot = outputBase ? path.resolve(outputBase) : PROJECT_ROOT;
  if (path.basename(outputRoot).toLowerCase() === 'outputs') {
    console.log(`Output base pointed at an outputs folder; using parent directory instead: ${path.dirname(outputRoot)}`);
    outputRoot = path.dirname(outputRoot);
  }
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
    const tempDir = path.join(baseDir, '.tmp');
    console.log(`Processing single video: ${title}`);
    try {
      const out = getTranscriptForVideo(ytDlp, inputUrl, tempDir);
      fs.writeFileSync(filePath, out, 'utf8');
      // append to combined
      try {
        fs.appendFileSync(combinedFile, `=== ${title} ===\nURL: ${inputUrl}\n\n` + out + "\n\n", 'utf8');
      } catch {}
      console.log(`Saved ${filePath}`);
    } catch (err) {
      console.error(`Failed to process video: ${String(err.message || err)}`);
      process.exit(1);
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    return;
  }

  console.log(`Processing playlist: ${baseDirName} (${entries.length} entries)`);
  const tempDir = path.join(baseDir, '.tmp');
  for (const entry of entries) {
    const id = entry.id || entry.video_id || null;
    const webpage = entry.webpage_url || (id ? `https://youtu.be/${id}` : null);
    const title = entry.title || entry.fulltitle || id || 'video';
    const safeName = sanitizeName(title) || id || 'video';
    const outFile = uniqueFilePath(baseDir, safeName, '.txt');
    try {
      console.log(` -> ${title}`);
      if (!webpage) throw new Error('No video URL');
      const out = getTranscriptForVideo(ytDlp, webpage, tempDir);
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
  // Clean up temp dir
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
}

main();
