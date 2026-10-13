"""Download the anthem recordings from Wikimedia Commons and convert them to MP3.

Usage: python fetch_anthems.py <download-dir>

Each file is trimmed of leading silence, loudness-normalized, and saved whole as
app/assets/audio/anthems/<code>.mp3. The app plays a window of it, so tuning the
start point is a data edit (song_starts.json), not a re-encode.
Licence data goes to tools/build/anthem_manifest.json for the credits page.
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import imageio_ffmpeg

from countries import COUNTRIES

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "assets" / "audio" / "anthems"
BUILD = ROOT / "tools" / "build"
UA = {"User-Agent": "SpinTheGlobe/0.2 (https://www.nucba.ac.jp/; one-off fetch of public-domain anthems "
                    "for a university festival quiz) python-urllib"}
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def file_info(titles):
    info = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        d = api({"action": "query", "titles": "|".join("File:" + t for t in chunk), "prop": "imageinfo",
                 "iiprop": "url|extmetadata", "iiextmetadatafilter": "LicenseShortName|Artist|Credit"})
        norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
        for p in d["query"]["pages"].values():
            if "imageinfo" not in p:
                raise SystemExit(f"Missing on Commons: {p['title']}")
            ii = p["imageinfo"][0]
            m = ii.get("extmetadata", {})
            asked = norm.get(p["title"], p["title"])[5:]
            info[asked] = {
                "url": ii["url"],
                "page": ii["descriptionurl"],
                "license": strip_html(m.get("LicenseShortName", {}).get("value")),
                "artist": strip_html(m.get("Artist", {}).get("value")),
            }
        time.sleep(1)
    return info


def download(url, dest):
    """Return True on success. Rate limits (429) back off, honouring Retry-After."""
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                dest.write_bytes(r.read())
            return True
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 30 * (attempt + 1)
            time.sleep(min(wait, 300))
    return False


def convert(src, dest):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(src),
                    "-af", "silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ac", "1", "-ar", "44100", "-b:a", "112k", str(dest)], check=True)


def main(dl_dir):
    dl_dir.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    wanted = {c["code"]: c["anthem"] for c in COUNTRIES if c.get("anthem")}
    info = file_info(list(wanted.values()))
    manifest, skipped = {}, []
    for code, title in wanted.items():
        meta = info[title]
        if "public domain" not in meta["license"].lower():
            print(f"WARN  {code}: licence is {meta['license']!r}, credit required")
        raw = dl_dir / (code + Path(title).suffix)
        if not raw.exists():
            if not download(meta["url"], raw):
                skipped.append(code)
                print(f"SKIP  {code}  still rate-limited; rerun later")
                continue
            time.sleep(10)
        dest = OUT / f"{code}.mp3"
        if not dest.exists() or dest.stat().st_mtime < raw.stat().st_mtime:
            convert(raw, dest)
        manifest[code] = {"title": title, **meta}
        print(f"ok    {code}  {meta['license']:14}  {title}")
    (BUILD / "anthem_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf8")
    print(f"{len(manifest)} anthems ready" + (f"; skipped {', '.join(skipped)}" if skipped else ""))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
