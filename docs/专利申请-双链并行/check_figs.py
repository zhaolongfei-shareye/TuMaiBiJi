#!/usr/bin/env python3
"""附图几何自检：越界、文字溢出、框体互相压叠、文字压在框线上。

只认本套图用到的元素：rect / polygon / line / polyline / path 折线 / text。
菱形（polygon）按真实四边形判交，不用外接矩形，避免假红。
"""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
NS = "{http://www.w3.org/2000/svg}"
CJK, ASCII = 1.0, 0.55
TOL = 1.0


def text_w(s, fs):
    return sum(fs * (CJK if ord(c) > 0x2E80 else ASCII) for c in s)


def nums(s):
    return [float(n) for n in re.findall(r"-?\d+\.?\d*", s)]


def pts_of(s):
    n = nums(s)
    return list(zip(n[0::2], n[1::2]))


def bbox(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


def bbox_intersect(a, b, pad=0.0):
    return not (a[0] + a[2] + pad < b[0] or b[0] + b[2] + pad < a[0]
                or a[1] + a[3] + pad < b[1] or b[1] + b[3] + pad < a[1])


def rect_area_overlap(a, b):
    ix = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    return ix * iy


def corners(r):
    x, y, w, h = r
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def seg_hit(p, q, a, b):
    """线段 pq 与 ab 是否相交。"""
    def cr(o, u, v):
        return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0])
    d1, d2 = cr(a, b, p), cr(a, b, q)
    d3, d4 = cr(p, q, a), cr(p, q, b)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))


def poly_edges(poly):
    return list(zip(poly, poly[1:] + poly[:1]))


def point_in_poly(pt, poly):
    x, y = pt
    inside = False
    for (x1, y1), (x2, y2) in poly_edges(poly):
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xi:
                inside = not inside
    return inside


def poly_hit(poly, other):
    """两个多边形（含矩形转成的四边形）是否相交。"""
    if any(point_in_poly(p, other) for p in poly):
        return True
    if any(point_in_poly(p, poly) for p in other):
        return True
    ea, eb = poly_edges(poly), poly_edges(other)
    return any(seg_hit(p, q, a, b) for p, q in ea for a, b in eb)


class Shape:
    def __init__(self, kind, geo, desc):
        self.kind, self.geo, self.desc = kind, geo, desc
        if kind == "rect":
            self.bb = geo
            self.poly = corners(geo)
        else:
            self.poly = geo
            self.bb = bbox(geo)

    def contains(self, pt):
        x, y, w, h = self.bb
        if self.kind == "rect":
            return x <= pt[0] <= x + w and y <= pt[1] <= y + h
        return point_in_poly(pt, self.poly)

    def hits(self, other):
        if not bbox_intersect(self.bb, other.bb, -TOL):
            return False
        if self.kind == "rect" and other.kind == "rect":
            return rect_area_overlap(self.bb, other.bb) > min(
                self.bb[2] * self.bb[3], other.bb[2] * other.bb[3]) * 0.15
        return poly_hit(self.poly, other.poly)

    def boundary_hits_rect(self, r):
        """框的边线是否穿过给定矩形（用于查文字压在框线上）。"""
        if not bbox_intersect(self.bb, r, -TOL):
            return False
        rc = corners(r)
        if self.kind == "rect":
            x, y, w, h = self.bb
            inner = (x + TOL, y + TOL, w - 2 * TOL, h - 2 * TOL)
            # 文字框完全在框内或完全在框外都不算压线
            if not bbox_intersect(inner, r):
                return False
            if all(x - TOL <= c[0] <= x + w + TOL and y - TOL <= c[1] <= y + h + TOL
                   for c in rc):
                return False
            return True
        return poly_hit(self.poly, rc)


def check(path):
    errs = []
    root = ET.parse(path).getroot()
    vb = root.get("viewBox") or f"0 0 {root.get('width')} {root.get('height')}"
    _, _, W, H = [float(v) for v in vb.split()]

    shapes, texts = [], []

    def outside(bb, what):
        x, y, w, h = bb
        if x < -TOL or y < -TOL or x + w > W + TOL or y + h > H + TOL:
            errs.append(f"越界 {what}: x[{x:.0f},{x+w:.0f}] y[{y:.0f},{y+h:.0f}] "
                        f"画布 {W:.0f}x{H:.0f}")

    for el in root.iter():
        tag = el.tag.replace(NS, "")
        if tag == "defs":
            continue
        if tag == "rect":
            bb = (float(el.get("x", 0)), float(el.get("y", 0)),
                  float(el.get("width", 0)), float(el.get("height", 0)))
            if el.get("stroke") in (None, "none"):
                continue          # 白底／文字衬底，不参与几何判定
            outside(bb, "rect")
            if bb[2] > 60 and bb[3] > 30:
                shapes.append(Shape("rect", bb,
                            f"rect({bb[0]:.0f},{bb[1]:.0f},{bb[2]:.0f}x{bb[3]:.0f})"))
        elif tag == "polygon":
            p = pts_of(el.get("points", ""))
            if not p or el.get("fill") == "#000":
                continue          # 箭头实心三角
            bb = bbox(p)
            outside(bb, "polygon")
            shapes.append(Shape("poly", p,
                        f"polygon({bb[0]:.0f},{bb[1]:.0f},{bb[2]:.0f}x{bb[3]:.0f})"))
        elif tag == "path":
            p = pts_of(el.get("d", ""))
            if len(p) < 2:
                continue
            if p[0] == p[-1] and len(p) == 2:
                errs.append(f"零长度 line @ {p[0]}")
            outside(bbox(p), "path")
        elif tag == "text":
            fs = float(el.get("font-size", 13))
            x, y = float(el.get("x", 0)), float(el.get("y", 0))
            s = "".join(el.itertext())
            if not s.strip():
                continue
            anchor = el.get("text-anchor", "start")
            w = text_w(s, fs)
            lx = {"middle": x - w / 2, "end": x - w, "start": x}[anchor]
            ink = (lx, y - fs * 0.82, w, fs * 1.15)
            outside(ink, f"文字「{s[:10]}」")
            texts.append((ink, s, fs, (x, y)))

    for i in range(len(shapes)):
        for j in range(i + 1, len(shapes)):
            if shapes[i].hits(shapes[j]):
                errs.append(f"压叠 {shapes[i].desc} ∩ {shapes[j].desc}")

    for ink, s, fs, at in texts:
        cx, cy = ink[0] + ink[2] / 2, ink[1] + ink[3] / 2
        host = min((sh for sh in shapes if sh.contains((cx, cy))),
                   key=lambda sh: sh.bb[2] * sh.bb[3], default=None)
        if host is None:
            for sh in shapes:
                if sh.boundary_hits_rect(ink):
                    errs.append(f"文字压在框线上「{s[:14]}」@({at[0]:.0f},{at[1]:.0f}) "
                                f"→ {sh.desc}")
            continue
        x, y, bw, bh = host.bb
        if ink[2] > bw - 6:
            errs.append(f"文字超框({host.desc}) 需{ink[2]:.0f} 宽{bw:.0f}: {s[:20]}")
        if ink[1] < y - 2 or ink[1] + ink[3] > y + bh + 2:
            errs.append(f"文字出框({host.desc}) y[{ink[1]:.0f},{ink[1]+ink[3]:.0f}] "
                        f"框 y[{y:.0f},{y+bh:.0f}]: {s[:16]}")
    return errs, (W, H), len(shapes), len(texts)


def main():
    bad = 0
    for path in sorted(glob.glob(os.path.join(HERE, "patent-fig*.svg"))):
        errs, (W, H), ns, nt = check(path)
        name = os.path.basename(path)
        print(f"{'✗' if errs else '✓'} {name}  ({W:.0f}x{H:.0f}, {ns}框 {nt}字)")
        for e in errs:
            print(f"    - {e}")
        bad += bool(errs)
    print()
    print(f"{bad} 张图有问题" if bad else "六张图全部通过")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
