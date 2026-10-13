"""Generate the Language clips with Google Translate voices (gTTS).

Writes app/assets/audio/language/<id>.mp3 and tools/build/language_manifest.json.
A student recording saved under the same file name replaces a clip; rerunning
this script skips files that already exist unless --force is given.
"""
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import imageio_ffmpeg
from gtts import gTTS
from gtts.lang import tts_langs

from countries import LANGUAGE_CLIPS

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "assets" / "audio" / "language"
BUILD = ROOT / "tools" / "build"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# Locale → (gTTS language, Google domain that sets the accent)
GTTS = {
    "fr-FR": ("fr", "fr"),
    "es-ES": ("es", "es"),
    "pt-BR": ("pt", "com.br"),
    "zh-CN": ("zh-CN", "com"),
    "fil-PH": ("tl", "com"),
}


def voice_for(locale):
    lang, tld = GTTS.get(locale, (locale.split("-")[0], "com"))
    return (lang, tld) if lang in tts_langs() else None


def main(force):
    OUT.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for clip_id, locale, country, lang, text in LANGUAGE_CLIPS:
        target = OUT / f"{clip_id}.mp3"
        voice = voice_for(locale)
        manifest[clip_id] = {"voice": f"gTTS {voice[0]}/{voice[1]}" if voice else "recording",
                             "country": country, "lang": lang, "text": text}
        if target.exists() and not force:
            print(f"skip  {clip_id:6} (exists)")
            continue
        if not voice:
            print(f"TODO  {clip_id:6} no gTTS voice; save a recording as {target.name}")
            continue
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "raw.mp3"
            gTTS(text, lang=voice[0], tld=voice[1], slow=False).save(str(raw))
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(raw),
                            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100",
                            "-b:a", "96k", str(target)], check=True)
        print(f"wrote {clip_id:6} gTTS {voice[0]}/{voice[1]}")
        time.sleep(1)
    (BUILD / "language_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf8")


if __name__ == "__main__":
    main("--force" in sys.argv)
