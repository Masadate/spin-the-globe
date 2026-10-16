"""Publish the app to GitHub Pages: https://masadate.github.io/spin-the-globe/

Usage: python publish.py "what changed"

Regenerates the offline files, clones the repo into a temp folder, mirrors
app/ to the site root (plus guides/, tools/ and README.md), commits, and pushes.
The Drive folder stays the source of truth and never holds a .git folder.

guides/ holds team pages, such as the wheel marking guide. They sit outside
app/, so they never change the quiz's build stamp or its offline cache.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "Masadate/spin-the-globe"
GIT_AUTH = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
TRAILER = "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
TOOL_FILES = ["*.py", "*.js", "song_starts.json", "build/*.json"]


def run(*cmd, cwd=None):
    subprocess.run(cmd, cwd=cwd, check=True)


def mirror(site):
    for p in site.iterdir():
        if p.name != ".git":
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    shutil.copytree(ROOT / "app", site, dirs_exist_ok=True)
    shutil.copytree(ROOT / "guides", site / "guides", dirs_exist_ok=True)
    for pattern in TOOL_FILES:
        for f in (ROOT / "tools").glob(pattern):
            dest = site / "tools" / f.relative_to(ROOT / "tools")
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, dest)
    shutil.copyfile(ROOT / "README.md", site / "README.md")
    (site / ".nojekyll").write_text("")


def main(message):
    run(sys.executable, str(ROOT / "tools" / "build_site.py"))
    with tempfile.TemporaryDirectory() as tmp:
        site = Path(tmp) / "site"
        run("git", *GIT_AUTH, "clone", "--quiet", f"https://github.com/{REPO}.git", str(site))
        run("git", "symbolic-ref", "HEAD", "refs/heads/main", cwd=site)
        mirror(site)
        run("git", "add", "-A", cwd=site)
        if not subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=site).returncode:
            print("Nothing changed; nothing published.")
            return
        run("git", "commit", "--quiet", "-m", message, "-m", TRAILER, cwd=site)
        run("git", *GIT_AUTH, "push", "--quiet", "origin", "main", cwd=site)
    print(f"Pushed. Live in about a minute at https://masadate.github.io/spin-the-globe/")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit('Usage: python publish.py "what changed"')
    main(sys.argv[1])
