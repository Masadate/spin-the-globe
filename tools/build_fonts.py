"""Bundle the festival fonts so the quiz keeps its look offline.

The faces match sagaminesai.nucba.ac.jp: Shrikhand for titles, Patua One for
headings and buttons, Kaisei Decol Bold for Japanese. Kaisei Decol is cut down
to kana plus every other Japanese character the app shows, so rerun this after
Japanese text changes in countries.py, config.js or index.html.

Usage: python build_fonts.py <font dir>
The font dir holds Shrikhand-Regular.ttf, PatuaOne-Regular.ttf, KaiseiDecol-Bold.ttf
and OFL-*.txt, from github.com/google/fonts (SIL Open Font License 1.1).
Patua One has a Reserved Font Name, so it ships unmodified.
"""
import shutil
import sys
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
OUT = APP / "assets" / "fonts"

LATIN = [*range(0x20, 0x7F), *range(0xA0, 0x100), *range(0x2010, 0x203B)]
KANA = [*range(0x3000, 0x3100), *range(0xFF01, 0xFF5F)]


def app_japanese():
    files = [APP / "index.html", *sorted((APP / "js").glob("*.js"))]
    text = "".join(p.read_text(encoding="utf8") for p in files)
    return {ord(ch) for ch in text if ord(ch) >= 0x2E80}


def cut(src, dst, unicodes):
    opts = subset.Options()
    opts.flavor = "woff2"
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted(unicodes))
    sub.subset(font)
    subset.save_font(font, str(dst), opts)


def main():
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    cut(src / "Shrikhand-Regular.ttf", OUT / "Shrikhand.woff2", LATIN)
    cut(src / "KaiseiDecol-Bold.ttf", OUT / "KaiseiDecol-Bold.woff2", set(KANA) | app_japanese())
    shutil.copyfile(src / "PatuaOne-Regular.ttf", OUT / "PatuaOne-Regular.ttf")
    for lic in src.glob("OFL-*.txt"):
        shutil.copyfile(lic, OUT / lic.name)
    for p in sorted(OUT.iterdir()):
        print(f"{p.name}: {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
