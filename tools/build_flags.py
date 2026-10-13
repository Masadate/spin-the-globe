"""Copy the 4:3 flag SVGs for the quiz countries from the flag-icons package (MIT).

Usage: python build_flags.py <flag-icons package dir>
"""
import shutil
import sys
from pathlib import Path

from countries import COUNTRIES

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "assets" / "flags"


def main(pkg):
    pkg = Path(pkg)
    OUT.mkdir(parents=True, exist_ok=True)
    for c in COUNTRIES:
        shutil.copyfile(pkg / "flags" / "4x3" / f"{c['code']}.svg", OUT / f"{c['code']}.svg")
    shutil.copyfile(pkg / "LICENSE", OUT / "LICENSE-flag-icons.txt")
    print(f"copied {len(COUNTRIES)} flags")


if __name__ == "__main__":
    main(sys.argv[1])
