#!/usr/bin/env python3
"""Analyse rapide de fichiers STL pour préparer un modèle paramétrique (viewer3d.js).

Usage : python3 -I tools/analyse-stl.py piece1.stl [piece2.stl ...]

Pour chaque fichier, affiche en texte court (pas d'image) :
  - nombre de triangles, boîte englobante, dimensions ;
  - par axe, la distance du centre au 1er détail (sommet), en ignorant les arêtes
    droites du chanfrein de fond (z < zmin + 0,2). Une bande un peu plus étroite que
    cette distance peut être étirée sans déformer les détails ;
  - les plus grands vides entre sommets sur chaque axe (utile quand la zone libre
    n'est pas centrée, typiquement la hauteur : ex. 4,40→22,40) ;
  - les trous et axes cylindriques (cercles détectés sur les arêtes vives) :
    axe, centre, rayon, et si le cercle est fermé ou ouvert. Les trous fermés sont fiables ;
    un crochet en C ouvert sur le contour extérieur peut ne pas être détecté.
Ne dépend que de numpy.
"""
import sys
import numpy as np


def load(path):
    data = open(path, "rb").read()
    n = int.from_bytes(data[80:84], "little")
    if len(data) == 84 + 50 * n:  # STL binaire
        rec = np.frombuffer(data[84:84 + 50 * n],
                            dtype=np.dtype([("n", "<3f4"), ("v", "<9f4"), ("a", "<u2")]))
        return rec["v"].reshape(-1, 3, 3).astype(np.float64)
    pts = [list(map(float, l.split()[1:4])) for l in data.decode(errors="ignore").splitlines()
           if l.strip().startswith("vertex")]
    return np.array(pts, dtype=np.float64).reshape(-1, 3, 3)


def central_band(v, ax, zmin):
    keep = v[:, 2] > zmin + 0.2 if ax != 2 else np.ones(len(v), bool)
    c = (v[:, ax].min() + v[:, ax].max()) / 2
    d = np.abs(v[keep, ax] - c)
    return c, (d.min() if len(d) else 0.0)


def largest_gaps(v, ax, k=3):
    u = np.unique(v[:, ax].round(2))
    g = np.diff(u)
    idx = np.argsort(g)[::-1][:k]
    return [(u[i], u[i + 1]) for i in sorted(idx)]


def circles(tris):
    """Cercles portés par les arêtes vives (angle > 20°) situées dans un plan normal à un axe."""
    keyf = lambda p: tuple(np.round(p, 3))
    normals = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    ln = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = normals / np.where(ln == 0, 1, ln)
    edges = {}
    for t, tri in enumerate(tris):
        for i in range(3):
            a, b = keyf(tri[i]), keyf(tri[(i + 1) % 3])
            edges.setdefault((min(a, b), max(a, b)), []).append(t)
    found = []
    for ax in range(3):
        o = [i for i in range(3) if i != ax]
        graph = {}
        for (a, b), ts in edges.items():
            if abs(a[ax] - b[ax]) > 1e-3 or len(ts) != 2:
                continue
            if np.dot(normals[ts[0]], normals[ts[1]]) > np.cos(np.radians(20)):
                continue
            graph.setdefault(a, set()).add(b)
            graph.setdefault(b, set()).add(a)
        seen = set()
        for start in graph:
            if start in seen:
                continue
            comp, stack = [], [start]
            seen.add(start)
            while stack:
                p = stack.pop()
                comp.append(p)
                for q in graph[p]:
                    if q not in seen:
                        seen.add(q)
                        stack.append(q)
            if len(comp) < 6:
                continue
            P = np.array(comp)[:, o]
            A = np.c_[2 * P, np.ones(len(P))]
            sol = np.linalg.lstsq(A, (P ** 2).sum(1), rcond=None)[0]
            cx, cy = sol[0], sol[1]
            r = np.sqrt(max(sol[2] + cx * cx + cy * cy, 0))
            if not 0.5 <= r <= 15:
                continue
            res = np.abs(np.hypot(P[:, 0] - cx, P[:, 1] - cy) - r)
            if res.max() > max(0.05, 0.03 * r):
                continue
            ang = np.sort(np.degrees(np.arctan2(P[:, 1] - cy, P[:, 0] - cx)))
            gap = np.max(np.diff(np.r_[ang, ang[0] + 360]))
            centre = [0.0, 0.0, 0.0]
            centre[o[0]], centre[o[1]], centre[ax] = cx, cy, comp[0][ax]
            found.append(("XYZ"[ax], tuple(round(float(c), 2) for c in centre), round(float(r), 2),
                          "fermé" if gap < 60 else f"ouvert ({360 - gap:.0f}°)"))
    # un cylindre donne un cercle à chaque extrémité : on regroupe par axe + position dans le plan
    merged = {}
    for axn, c, r, kind in found:
        i = "XYZ".index(axn)
        key = (axn, round(r, 1)) + tuple(round(c[j], 1) for j in range(3) if j != i)
        merged.setdefault(key, (axn, c, r, kind, []))[4].append(c[i])
    return [(a, c, r, k, (min(s), max(s))) for a, c, r, k, s in merged.values()]


def main(paths):
    for path in paths:
        tris = load(path)
        v = tris.reshape(-1, 3)
        lo, hi = v.min(0), v.max(0)
        print(f"\n## {path.split('/')[-1]}  —  {len(tris)} triangles")
        print(f"min {np.round(lo, 2).tolist()}  max {np.round(hi, 2).tolist()}  "
              f"dims {np.round(hi - lo, 2).tolist()} mm")
        for ax in range(3):
            c, h = central_band(v, ax, lo[2])
            gaps = ", ".join(f"{a:.2f}→{b:.2f}" for a, b in largest_gaps(v, ax))
            print(f"  {'XYZ'[ax]} : centre {c:.2f}, 1er détail à ±{h:.2f} du centre | plus grands vides : {gaps}")
        holes = circles(tris)
        if holes:
            print("  cercles (axe, centre, rayon, type, étendue sur l'axe) :")
            for a, c, r, k, (s0, s1) in sorted(holes, key=lambda h: (h[0], h[1])):
                print(f"    {a}  {list(c)}  r={r}  {k}  [{s0:.2f} … {s1:.2f}]")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
