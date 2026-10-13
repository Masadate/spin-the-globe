"""Build the map data for the Geographical Location segment.

Usage: python build_maps.py <ne_50m_admin_0_countries.geojson>

Writes app/js/maps.js with three globals:
  WORLD    Miller-projected world map. Quiz countries are separate paths keyed
           by code; all other land is one "rest" path.
  MAPVIEW  per quiz country: [centre-x, centre-y, view-width, marker-radius]
  SHAPES   per silhouette country: {vb, d} in a local Mercator projection
"""
import json
import math
import sys
from pathlib import Path

from countries import COUNTRIES

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "js" / "maps.js"

W = 1000
S = W / (2 * math.pi)
LAT_TOP, LAT_BOTTOM = 84, -58

# Polygons to drop from silhouettes and view centring (overseas or remote parts).
KEEP = {
    "USA": lambda lon, lat: -130 < lon < -60 and 23 < lat < 50,
    "NOR": lambda lon, lat: lat < 72,
    "FRA": lambda lon, lat: lon > -6 and lat > 41,
    "NLD": lambda lon, lat: lat > 50,
    "ESP": lambda lon, lat: lat > 35,
    "PRT": lambda lon, lat: lon > -10,
    "CHL": lambda lon, lat: lon > -77,
    "NZL": lambda lon, lat: lon > 165 and lat < -33,
    "AUS": lambda lon, lat: lon > 112 and lat < -9,
    "RUS": lambda lon, lat: lon > 0,
    "ECU": lambda lon, lat: lon > -85,
    "GBR": lambda lon, lat: lat > 49,
}
MIN_SHARE = 0.003  # drop islands smaller than 0.3% of the main polygon


def miller(lon, lat):
    lat = max(min(lat, LAT_TOP), LAT_BOTTOM)
    y = 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))
    return lon, y


Y_TOP = miller(0, LAT_TOP)[1]
H = round((Y_TOP - miller(0, LAT_BOTTOM)[1]) * S, 1)


def world_xy(lon, lat):
    _, y = miller(lon, lat)
    return (lon + 180) / 360 * W, (Y_TOP - y) * S


def simplify(pts, tol):
    """Douglas–Peucker on a closed ring."""
    if len(pts) < 5:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        best, idx = 0.0, None
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm if (dx or dy) else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def ring_path(pts):
    out, px, py = [], None, None
    for x, y in pts:
        x, y = round(x, 1), round(y, 1)
        if px is None:
            out.append(f"M{x:g} {y:g}")
        else:
            ddx, ddy = round(x - px, 1), round(y - py, 1)
            if ddx == 0 and ddy == 0:
                continue
            out.append(f"l{ddx:g} {ddy:g}")
        px, py = x, y
    return "".join(out) + "z" if len(out) > 2 else ""


def polygons(feature):
    g = feature["geometry"]
    return g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]


def ring_area(ring):
    """Approximate area in degree² scaled by cos(latitude)."""
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += (x1 * y2 - x2 * y1) * math.cos(math.radians((y1 + y2) / 2))
    return abs(a) / 2


def centroid(ring):
    xs, ys = zip(*ring)
    return sum(xs) / len(xs), sum(ys) / len(ys)


def main_polygons(a3, polys):
    rule = KEEP.get(a3, lambda lon, lat: True)
    cands = [p for p in polys if rule(*centroid(p[0]))]
    biggest = max(ring_area(p[0]) for p in cands)
    return [p for p in cands if ring_area(p[0]) >= MIN_SHARE * biggest]


def world_path(polys, tol, min_area):
    parts = []
    for poly in polys:
        for k, ring in enumerate(poly):
            pts = [world_xy(lon, lat) for lon, lat in ring]
            xs, ys = zip(*pts)
            if k == 0 and (max(xs) - min(xs)) * (max(ys) - min(ys)) < min_area:
                break
            parts.append(ring_path(simplify(pts, tol)))
    return "".join(parts)


def mercator_y(lat):
    return math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def silhouette(a3, polys):
    shift = 360 if a3 == "RUS" else 0
    rings = [[(lon + shift if lon < 0 and shift else lon, mercator_y(lat)) for lon, lat in ring]
             for poly in polys for ring in poly]
    xs = [x for r in rings for x, _ in r]
    ys = [y for r in rings for _, y in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    box = 400
    scale = box * 0.92 / max(maxx - minx, maxy - miny)
    w, h = (maxx - minx) * scale + box * 0.08, (maxy - miny) * scale + box * 0.08
    pad = box * 0.04
    d = "".join(ring_path(simplify([((x - minx) * scale + pad, (maxy - y) * scale + pad) for x, y in r], 0.6))
                for r in rings)
    return {"vb": f"0 0 {w:.0f} {h:.0f}", "d": d}


def main(src):
    feats = json.loads(Path(src).read_text(encoding="utf8"))["features"]
    by_a3 = {f["properties"]["ADM0_A3"]: f for f in feats}
    quiz = {c["a3"]: c for c in COUNTRIES if not c.get("nomap")}

    world = {}
    rest = []
    for a3, f in by_a3.items():
        if a3 == "ATA":
            continue
        if a3 in quiz:
            world[quiz[a3]["code"]] = world_path(polygons(f), 0.25, 0.0)
        else:
            rest.append(world_path(polygons(f), 0.35, 0.6))
    world["rest"] = "".join(rest)

    views, shapes = {}, {}
    for a3, c in quiz.items():
        polys = main_polygons(a3, polygons(by_a3[a3]))
        pts = [world_xy(lon, lat) for p in polys for lon, lat in p[0]]
        xs, ys = zip(*pts)
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        span = max(max(xs) - min(xs), (max(ys) - min(ys)) * 16 / 9)
        vw = min(max(span * 3.2, 150), W)
        marker = round(vw * 0.035, 1) if span < vw * 0.06 else 0
        views[c["code"]] = [round(cx, 1), round(cy, 1), round(vw, 1), marker]
        if c.get("shape"):
            shapes[c["code"]] = silhouette(a3, polys)

    js = ("// Generated by tools/build_maps.py from Natural Earth 1:50m (public domain).\n"
          f"window.WORLD = {json.dumps({'w': W, 'h': H, 'd': world}, separators=(',', ':'))};\n"
          f"window.MAPVIEW = {json.dumps(views, separators=(',', ':'))};\n"
          f"window.SHAPES = {json.dumps(shapes, separators=(',', ':'))};\n")
    OUT.write_text(js, encoding="utf8")
    print(f"maps.js {len(js) / 1024:.0f} KB · {len(views)} views · {len(shapes)} silhouettes")


if __name__ == "__main__":
    main(sys.argv[1])
