#!/usr/bin/env python3
"""GymBro — YouTube Playlist/Video Transcript Extractor GUI.

Usage:
  python scripts/playlist_gui.py
  scripts\\playlist_ui.bat   (Windows shortcut)
"""
import os
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
from pathlib import Path


class GymBroApp:
    def __init__(self, root):
        self.root = root
        self.root.title("GymBro — Transcript Extractor")
        self.root.geometry("640x480")
        self.root.minsize(500, 400)
        self.root.configure(bg="#1e1e2e")

        self.process = None

        self._build_ui()

    def _build_ui(self):
        bg = "#1e1e2e"
        fg = "#cdd6f4"
        accent = "#89b4fa"
        entry_bg = "#313244"
        btn_bg = "#45475a"
        btn_active = "#585b70"

        # Title
        title = tk.Label(
            self.root, text="GymBro", font=("Segoe UI", 20, "bold"),
            bg=bg, fg=accent
        )
        title.pack(pady=(16, 4))

        subtitle = tk.Label(
            self.root, text="YouTube Transcript Extractor",
            font=("Segoe UI", 10), bg=bg, fg=fg
        )
        subtitle.pack(pady=(0, 12))

        # URL input
        url_frame = tk.Frame(self.root, bg=bg)
        url_frame.pack(fill="x", padx=24, pady=(0, 8))

        tk.Label(
            url_frame, text="YouTube Video or Playlist URL",
            font=("Segoe UI", 9), bg=bg, fg=fg, anchor="w"
        ).pack(fill="x")

        self.url_entry = tk.Entry(
            url_frame, font=("Segoe UI", 11), bg=entry_bg, fg=fg,
            insertbackground=fg, relief="flat", highlightthickness=1,
            highlightcolor=accent, highlightbackground="#45475a"
        )
        self.url_entry.pack(fill="x", ipady=6, pady=(4, 0))

        # Output folder
        out_frame = tk.Frame(self.root, bg=bg)
        out_frame.pack(fill="x", padx=24, pady=(0, 12))

        tk.Label(
            out_frame, text="Output Folder",
            font=("Segoe UI", 9), bg=bg, fg=fg, anchor="w"
        ).pack(fill="x")

        row = tk.Frame(out_frame, bg=bg)
        row.pack(fill="x", pady=(4, 0))

        self.out_entry = tk.Entry(
            row, font=("Segoe UI", 11), bg=entry_bg, fg=fg,
            insertbackground=fg, relief="flat", highlightthickness=1,
            highlightcolor=accent, highlightbackground="#45475a"
        )
        self.out_entry.pack(side="left", fill="x", expand=True, ipady=6)
        self.out_entry.insert(0, os.getcwd())

        browse_btn = tk.Button(
            row, text="Browse", font=("Segoe UI", 9),
            bg=btn_bg, fg=fg, activebackground=btn_active, activeforeground=fg,
            relief="flat", cursor="hand2", command=self._browse_folder
        )
        browse_btn.pack(side="left", padx=(8, 0), ipady=4, ipadx=8)

        # Buttons
        btn_frame = tk.Frame(self.root, bg=bg)
        btn_frame.pack(pady=(0, 8))

        self.start_btn = tk.Button(
            btn_frame, text="▶  Start Extraction", font=("Segoe UI", 11, "bold"),
            bg=accent, fg="#1e1e2e", activebackground="#74c7ec", activeforeground="#1e1e2e",
            relief="flat", cursor="hand2", command=self._start,
            padx=20, pady=6
        )
        self.start_btn.pack(side="left", padx=4)

        self.stop_btn = tk.Button(
            btn_frame, text="■  Stop", font=("Segoe UI", 11),
            bg="#f38ba8", fg="#1e1e2e", activebackground="#eba0ac", activeforeground="#1e1e2e",
            relief="flat", cursor="hand2", command=self._stop, state="disabled",
            padx=16, pady=6
        )
        self.stop_btn.pack(side="left", padx=4)

        # Log output
        log_label = tk.Label(
            self.root, text="Output Log", font=("Segoe UI", 9),
            bg=bg, fg=fg, anchor="w"
        )
        log_label.pack(fill="x", padx=24)

        self.log = scrolledtext.ScrolledText(
            self.root, font=("Consolas", 9), bg="#181825", fg=fg,
            insertbackground=fg, relief="flat", highlightthickness=1,
            highlightcolor="#45475a", highlightbackground="#313244",
            state="disabled", wrap="word"
        )
        self.log.pack(fill="both", expand=True, padx=24, pady=(4, 16))

    def _browse_folder(self):
        folder = filedialog.askdirectory(initialdir=self.out_entry.get() or os.getcwd())
        if folder:
            self.out_entry.delete(0, tk.END)
            self.out_entry.insert(0, folder)

    def _append_log(self, text):
        self.log.configure(state="normal")
        self.log.insert(tk.END, text)
        self.log.see(tk.END)
        self.log.configure(state="disabled")

    def _start(self):
        url = self.url_entry.get().strip()
        outdir = self.out_entry.get().strip() or os.getcwd()

        if not url:
            messagebox.showwarning("Missing URL", "Please enter a YouTube video or playlist URL.")
            return

        # Validate URL looks like YouTube
        if "youtube.com" not in url and "youtu.be" not in url:
            if not messagebox.askyesno(
                "Non-YouTube URL",
                "This doesn't look like a YouTube URL. Continue anyway?"
            ):
                return

        outdir = os.path.abspath(outdir)
        normalize_note = None
        if os.path.basename(outdir).lower() == "outputs":
            outdir = os.path.dirname(outdir)
            normalize_note = f"Note: selected outputs folder as base; using parent: {outdir}\n"
        os.makedirs(outdir, exist_ok=True)

        script_dir = Path(__file__).resolve().parent
        extractor = script_dir / "playlist-extract.js"
        if not extractor.exists():
            messagebox.showerror("Error", f"Extractor script not found:\n{extractor}")
            return

        node = shutil.which("node") or shutil.which("node.exe")
        if not node:
            messagebox.showerror("Error", "Node.js not found on PATH.\nInstall Node 24+ and re-run.")
            return

        # Clear log and disable start
        self.log.configure(state="normal")
        self.log.delete("1.0", tk.END)
        self.log.configure(state="disabled")

        if normalize_note:
            self._append_log(normalize_note)

        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")

        self._append_log(f"URL: {url}\n")
        self._append_log(f"Output: {os.path.join(outdir, 'outputs')}\n")
        self._append_log("─" * 50 + "\n")

        # Run in background thread
        thread = threading.Thread(
            target=self._run_extractor,
            args=(node, str(extractor), url, outdir),
            daemon=True
        )
        thread.start()

    def _run_extractor(self, node, extractor, url, cwd):
        try:
            self.process = subprocess.Popen(
                [node, extractor, url, "--output", cwd],
                cwd=os.path.dirname(os.path.dirname(extractor)),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

            for line in self.process.stdout:
                self.root.after(0, self._append_log, line)

            self.process.wait()
            code = self.process.returncode

            if code == 0:
                self.root.after(0, self._append_log, "\n✓ Done! Transcripts saved.\n")
            else:
                self.root.after(0, self._append_log, f"\n✗ Extractor exited with code {code}\n")

        except Exception as e:
            self.root.after(0, self._append_log, f"\n✗ Error: {e}\n")
        finally:
            self.process = None
            self.root.after(0, self._on_finished)

    def _on_finished(self):
        self.start_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")

    def _stop(self):
        if self.process:
            self.process.terminate()
            self._append_log("\n⚠ Stopped by user.\n")


def main():
    root = tk.Tk()
    GymBroApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
