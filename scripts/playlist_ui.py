#!/usr/bin/env python3
"""Simple interactive UI to run the playlist extractor without PowerShell.

Usage:
  python scripts\playlist_ui.py
  python scripts\playlist_ui.py <URL> <outdir>
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path


def prompt(text, default=None):
    try:
        if default:
            value = input(f"{text} [{default}]: ").strip()
            return value if value else default
        return input(f"{text}: ").strip()
    except (KeyboardInterrupt, EOFError):
        print('\nCancelled')
        sys.exit(1)


def main():
    url = None
    outdir = None
    if len(sys.argv) > 1:
        url = sys.argv[1]
    if len(sys.argv) > 2:
        outdir = sys.argv[2]

    if not url:
        url = prompt('Enter YouTube video or playlist URL')
    if not url:
        print('No URL provided')
        sys.exit(2)

    if not outdir:
        default = os.getcwd()
        outdir = prompt('Output base folder (will create outputs/ inside this)', default)
    outdir = os.path.abspath(outdir)
    if os.path.basename(outdir).lower() == 'outputs':
        parent = os.path.dirname(outdir)
        print(f"Note: selected outputs folder as base; using parent: {parent}")
        outdir = parent
    os.makedirs(outdir, exist_ok=True)

    script_dir = Path(__file__).resolve().parent
    extractor = script_dir / 'playlist-extract.js'
    if not extractor.exists():
        print(f'Extractor not found: {extractor}')
        sys.exit(1)

    node = shutil.which('node') or shutil.which('node.exe')
    if not node:
        print('Node.js not found on PATH. Install Node 24+ and re-run.')
        sys.exit(1)

    print(f"Running extractor for: {url}")
    print(f"Saving outputs under: {os.path.join(outdir, 'outputs')}")

    proc = subprocess.Popen([node, str(extractor), url, '--output', outdir])
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        proc.wait()
        sys.exit(1)

    if proc.returncode == 0:
        print('Done')
    else:
        print(f'Extractor exited with code {proc.returncode}')
    sys.exit(proc.returncode or 0)


if __name__ == '__main__':
    main()
