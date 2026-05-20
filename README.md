# GymBro — YouTube Transcript Summarizer

Extract, timestamp, and organize transcripts from YouTube videos and playlists. Powered by LLMs for intelligent summarization.

## Features

- **YouTube Playlists** — Process entire playlists in one command; each video gets its own transcript file.
- **Timestamps** — Include timestamps in transcripts for easy reference (`--timestamps`).
- **Organized Output** — Creates a folder per playlist/video with individual `.txt` files named after each video title.
- **Combined Transcripts** — Generates an `all_transcripts.txt` merging every video in a playlist.
- **Multiple Interfaces** — CLI, interactive terminal UI, Python UI, Electron GUI, and Chrome/Firefox extension.
- **LLM Summarization** — Summarize with OpenAI, Gemini, Claude, Groq, local models, or OpenRouter free tier.
- **Media-Aware** — Auto-detects video/audio vs page content; supports podcasts, HLS, local files.
- **Slide Extraction** — Screenshot + OCR + timestamped cards for video sources.

## Quick Start

### Prerequisites

- **Node.js 24+**
- **yt-dlp** (required for YouTube playlist/video extraction)
- **ffmpeg** (required for slides and media transcription)

```bash
# Install yt-dlp and ffmpeg (Windows — winget)
winget install yt-dlp ffmpeg

# macOS (Homebrew)
brew install yt-dlp ffmpeg
```

### Install

```bash
# Clone the repo
git clone https://github.com/appo02/GymBro.git
cd GymBro

# Install dependencies
npm install
# or
pnpm install

# Build
pnpm build
```

### Usage

#### Extract a single video with timestamps

```bash
pnpm summarize "https://youtu.be/dQw4w9WgXcQ" --extract --timestamps
```

#### Extract an entire playlist

```bash
pnpm extract:playlist "https://www.youtube.com/playlist?list=PLxxxxxx"
```

This creates:

```
outputs/
└── Playlist Title/
    ├── Video 1 Title.txt
    ├── Video 2 Title.txt
    ├── Video 3 Title.txt
    └── all_transcripts.txt      ← combined file
```

#### Interactive UI (no args needed)

```bash
# Node.js terminal UI
pnpm extract:ui-simple

# Python UI (no Node prompts dependency needed)
python scripts/playlist_ui.py

# Windows batch shortcut
scripts\playlist_ui.bat

# Electron GUI
pnpm start:gui
```

#### Summarize a URL

```bash
pnpm summarize "https://example.com" --model google/gemini-2.5-flash
```

#### Summarize with length control

```bash
pnpm summarize "https://example.com" --length long
pnpm summarize "https://example.com" --length 20k
```

### Supported Inputs

| Input | Example |
|-------|---------|
| YouTube video | `https://youtu.be/dQw4w9WgXcQ` |
| YouTube playlist | `https://www.youtube.com/playlist?list=...` |
| Web page | `https://example.com/article` |
| Local file | `/path/to/file.pdf` |
| Audio/Video | `/path/to/audio.mp3` |
| Podcast RSS | `https://feeds.npr.org/500005/podcast.xml` |
| HLS stream | `https://example.com/master.m3u8` |
| Stdin | `echo "text" \| pnpm summarize -` |

### Chrome/Firefox Extension

One-click summarizer for the current tab with a Side Panel/Sidebar.

1. Install the CLI globally: `npm i -g @steipete/summarize`
2. Install the extension from the Chrome Web Store
3. Open Side Panel → copy token → run: `summarize daemon install --token <TOKEN>`

### Configuration

Set your LLM API key:

```bash
# Environment variable (pick one)
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=...
export GROQ_API_KEY=...
export OPENROUTER_API_KEY=...
```

Or use the free tier:

```bash
summarize refresh-free   # needs OPENROUTER_API_KEY
summarize "https://example.com" --model free
```

## Project Structure

```
scripts/
├── playlist-extract.js    # Core playlist extraction logic
├── playlist-ui-simple.js  # Interactive terminal UI (readline)
├── playlist-ui.js         # Prompts-based terminal UI
├── playlist_ui.py         # Python alternative UI
└── playlist_ui.bat        # Windows batch launcher

apps/
├── gui/                   # Electron desktop GUI
└── chrome-extension/      # Browser extension (Chrome + Firefox)

src/                       # CLI + library source (TypeScript)
packages/core/             # Shared core library
outputs/                   # Generated transcript files
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build the project |
| `pnpm summarize <url>` | Summarize a URL (dev mode) |
| `pnpm extract:playlist <url>` | Extract playlist transcripts |
| `pnpm extract:ui-simple` | Interactive terminal extractor |
| `pnpm start:gui` | Launch Electron GUI |
| `pnpm test` | Run tests |
| `pnpm check` | Format + lint + typecheck + test |

## How It Works

1. **Playlist detection** — `yt-dlp` fetches playlist metadata (video titles, IDs, URLs).
2. **Per-video extraction** — Each video is processed through the summarize CLI with `--extract --timestamps`.
3. **File organization** — Outputs are saved to `outputs/<playlist-name>/<video-title>.txt`.
4. **Combined file** — All transcripts are concatenated into `all_transcripts.txt` with headers.

## License

MIT
