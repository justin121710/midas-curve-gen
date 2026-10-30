"""cable_pretension.py — 吊橋纜索初張力與無應力長度計算（書中附錄 B 第 2 版）

兩種用法：
  1) 參數式（獨立計算，與第 1 版相同的 60 m 例題）：
       python cable_pretension.py --demo
  2) 接 midas-curve-gen：讀它匯出的 .mct，依角色設定檔計算各纜索的 T 與 Lu，
     把 EXVAL／EXVAL2 填回 *ELEMENT，必要時把主纜節點移到索多邊形上：
       python cable_pretension.py model.mct roles.json [-o 輸出檔名前綴]

輸出（第 2 種用法）：
  <前綴>.mct          元素列已填好 EXVAL／EXVAL2 的 MCT（其餘資料列原樣保留）
  <前綴>_report.csv   每根纜索的長度、張力、水平分量、Lu、Lu/L
  <前綴>_tie_eq.csv   繫索的等值節點力（找形時代替繫索的 TIE_EQ 工況，可貼入
                      Midas 的 Nodal Loads 表格）

單位：一律沿用 .mct 的 *UNIT（輸入即輸出，全程不換算，與 midas-curve-gen 相同）。
只用 Python 標準函式庫。
"""
import csv, json, math, re, sys

# ---------------------------------------------------------------- 共用
KIND = {"Pretension": 1, "Horizontal": 2, "Lu": 3}   # Cable 的 EXVAL2 種類碼（實機樣本核對）


def unstressed(L, T, EA):
    """無應力長度 Lu = L / (1 + T/EA)"""
    return L / (1.0 + T / EA)


def exval(kind, L, Lh, T, EA):
    """依輸出種類回傳 EXVAL：Lu（長度）、Pretension（力）、Horizontal（張力的水平分量）"""
    if kind == "Lu":
        return unstressed(L, T, EA)
    if kind == "Pretension":
        return T
    if kind == "Horizontal":
        return T * Lh / L
    raise ValueError("output_kind 只能是 Lu、Pretension 或 Horizontal")


def fmt(v):
    s = f"{v:.6f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


# ---------------------------------------------------------------- MCT 讀寫
def expand_list(text):
    """midas 的清單語法：1001to1011、1001to1051by2、單一編號，以空白分隔"""
    out = []
    for tok in text.split():
        m = re.fullmatch(r"(\d+)to(\d+)(?:by(\d+))?", tok)
        if m:
            a, b, s = int(m.group(1)), int(m.group(2)), int(m.group(3) or 1)
            out.extend(range(a, b + 1, s))
        elif tok.isdigit():
            out.append(int(tok))
    return out


class Mct:
    """只解析本程式需要的四個區塊；其餘行原樣保留，寫回時不動。"""

    def __init__(self, text):
        self.newline = "\r\n" if "\r\n" in text else "\n"
        self.lines = text.splitlines()
        self.unit = ("?", "?")
        self.nodes, self.node_line = {}, {}
        self.elems, self.elem_line = {}, {}
        self.groups = {}
        sec = None
        for k, raw in enumerate(self.lines):
            s = raw.strip()
            if s.startswith("*"):
                sec = s.split()[0].split(";")[0].upper()
                continue
            data = s.split(";")[0].strip()
            if not data:
                continue
            f = [x.strip() for x in data.split(",")]
            if sec == "*UNIT":
                self.unit = (f[0], f[1])
            elif sec == "*NODE":
                n = int(f[0])
                self.nodes[n] = [float(f[1]), float(f[2]), float(f[3])]
                self.node_line[n] = k
            elif sec == "*ELEMENT":
                e = int(f[0])
                self.elems[e] = {"type": f[1], "i": int(f[4]), "j": int(f[5]), "f": f}
                self.elem_line[e] = k
            elif sec == "*GROUP":
                self.groups[f[0]] = {"nodes": expand_list(f[1]),
                                     "elems": expand_list(f[2] if len(f) > 2 else "")}

    def group_elems(self, name):
        if name not in self.groups:
            raise KeyError(f"MCT 裡沒有群組 {name}")
        return [e for e in self.groups[name]["elems"] if e in self.elems]

    def set_exval(self, e, kind_code, value):
        f = list(self.elems[e]["f"])
        if f[1].upper() != "TENSTR":
            raise ValueError(f"元素 {e} 不是 TENSTR（{f[1]}）")
        while len(f) < 10:
            f.append("0")
        f[7], f[8], f[9] = "3", fmt(value), str(kind_code)
        f = f[:10]                                   # Cable（iSUB=3）固定 10 欄
        self.lines[self.elem_line[e]] = "   " + ", ".join(f)

    def set_node(self, n, xyz):
        self.nodes[n] = list(xyz)
        self.lines[self.node_line[n]] = "   " + ", ".join([str(n)] + [fmt(c) for c in xyz])

    def text(self, header=()):
        """header 插在 *UNIT 之前（不改動 self.lines，節點與元素的行號才不會跑掉）"""
        out = list(self.lines)
        k = next((i for i, s in enumerate(out) if s.strip().upper().startswith("*UNIT")), 0)
        out[k:k] = list(header)
        return "\n".join(out) + "\n"


# ---------------------------------------------------------------- 幾何工具
def sub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def add(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def mul(a, s): return [a[0] * s, a[1] * s, a[2] * s]
def norm(a): return math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2)
def hlen(a): return math.hypot(a[0], a[1])
def unit(a): n = norm(a); return [a[0] / n, a[1] / n, a[2] / n]


def chain(mct, gname):
    """把一個群組的元素依連接順序排成一串：回傳 (節點串, 元素串)"""
    es = mct.group_elems(gname)
    adj = {}
    for e in es:
        i, j = mct.elems[e]["i"], mct.elems[e]["j"]
        adj.setdefault(i, []).append((j, e))
        adj.setdefault(j, []).append((i, e))
    ends = [n for n, v in adj.items() if len(v) == 1]
    if len(ends) != 2 or any(len(v) > 2 for v in adj.values()):
        raise ValueError(f"群組 {gname} 不是一條不分岔的節點串")
    start = min(ends, key=lambda n: (mct.nodes[n][0], mct.nodes[n][1]))
    ns, el, prev = [start], [], None
    while True:
        nxt = [(m, e) for m, e in adj[ns[-1]] if e != prev]
        if not nxt:
            break
        m, e = nxt[0]
        ns.append(m); el.append(e); prev = e
    return ns, el


# ---------------------------------------------------------------- 耐風索與繫索
def solve(A, b):
    """高斯消去（部分樞軸），A 為 list of list；節點數少，不需要外部套件"""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(c + 1, n):
            k = M[r][c] / M[c][c]
            if k:
                for cc in range(c, n + 1):
                    M[r][cc] -= k * M[c][cc]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (M[r][n] - sum(M[r][cc] * x[cc] for cc in range(r + 1, n))) / M[r][r]
    return x


def wind_form_finding(mct, cfg, ns, tie_of):
    """力密度法（force density method）：錨碇與繫索的橋面端固定，給定沿橋軸的
    張力分量 H_w 與繫索張力 tie_T，求耐風索節點的平衡位置（反覆更新力密度）"""
    Hw, tT, w_w = cfg["wind_H"], cfg["tie_T"], cfg["loads"].get("w_wind", 0.0)
    P = {n: list(mct.nodes[n]) for n in ns}
    ax = sub(P[ns[-1]], P[ns[0]]); ax = unit([ax[0], ax[1], 0.0])
    free = ns[1:-1]; idx = {n: k for k, n in enumerate(free)}
    for it in range(200):
        A = [[0.0] * len(free) for _ in free]
        rhs = [[0.0] * len(free) for _ in range(3)]
        def edge(a, b, q):
            for u, v in ((a, b), (b, a)):
                if u in idx:
                    A[idx[u]][idx[u]] += q
                    if v in idx:
                        A[idx[u]][idx[v]] -= q
                    else:
                        for c in range(3):
                            rhs[c][idx[u]] += q * mct.nodes[v][c] if v not in P else q * P[v][c]
        for k in range(len(ns) - 1):
            a, b = ns[k], ns[k + 1]
            d = sub(P[b], P[a]); dx = max(abs(d[0] * ax[0] + d[1] * ax[1]), 1e-9)
            edge(a, b, Hw / dx)
            if b in idx:
                rhs[2][idx[b]] -= w_w * norm(d) / 2
            if a in idx:
                rhs[2][idx[a]] -= w_w * norm(d) / 2
        for n in free:
            if n in tie_of:
                e, deck = tie_of[n]
                lt = norm(sub(mct.nodes[deck], P[n]))
                if lt < 1e-3:
                    raise ValueError("tie_T 相對於 wind_H 太大：耐風索被拉到橋面上"
                                     "（降低 tie_T 或提高 wind_H）")
                edge(n, deck, tT / lt)
        X = [solve(A, rhs[c]) for c in range(3)]
        move = 0.0
        for n in free:
            q = [X[0][idx[n]], X[1][idx[n]], X[2][idx[n]]]
            move = max(move, norm(sub(q, P[n])))
            P[n] = q
        if move < 1e-10:
            break
    for n in free:
        mct.set_node(n, P[n])
    return it + 1


def wind_system(mct, cfg, rep):
    """依 H_w 求每根繫索的張力與它作用在橋面節點的力（向量）"""
    Hw, out = cfg.get("wind_H", 0.0), {}
    w_w = cfg["loads"].get("w_wind", 0.0)
    tie_of, tie_grp = {}, {}                          # 耐風索節點 → (繫索元素, 橋面節點)
    for g in cfg.get("tie", []):
        for e in mct.group_elems(g):
            i, j = mct.elems[e]["i"], mct.elems[e]["j"]
            tie_of[i] = (e, j); tie_of[j] = (e, i); tie_grp[e] = g
    for g in cfg.get("wind", []):
        ns, el = chain(mct, g)
        if cfg.get("fix_wind") and "tie_T" in cfg:
            it = wind_form_finding(mct, cfg, ns, tie_of)
            print(f"{g}：以力密度法重算耐風索節點（{it} 次迭代收斂）")
        P = [mct.nodes[n] for n in ns]
        ax = sub(P[-1], P[0]); ax = unit([ax[0], ax[1], 0.0])
        T = []
        for k, e in enumerate(el):
            d = sub(P[k + 1], P[k]); dx = abs(d[0] * ax[0] + d[1] * ax[1])
            T.append(Hw * norm(d) / dx)
            rep.append(dict(group=g, elem=e, role="wind", L=norm(d), Lh=hlen(d), T=T[-1],
                            EA=cfg["EA"]["wind"]))
        resid = []
        for k in range(1, len(ns) - 1):
            n = ns[k]
            a, b = sub(P[k - 1], P[k]), sub(P[k + 1], P[k])
            F = add(mul(unit(a), T[k - 1]), mul(unit(b), T[k]))
            F[2] -= w_w * (norm(a) + norm(b)) / 2
            if n not in tie_of:
                resid.append(norm(F))
                continue
            e, deck = tie_of[n]
            d = unit(sub(mct.nodes[deck], mct.nodes[n]))
            t = norm(F)
            cosang = -(F[0] * d[0] + F[1] * d[1] + F[2] * d[2]) / t
            mis = math.degrees(math.acos(max(-1.0, min(1.0, cosang))))
            out[e] = dict(deck=deck, t=t, force=mul(d, -t), mis=mis)   # 繫索把橋面節點拉向耐風索
            dv = sub(mct.nodes[deck], mct.nodes[n])
            rep.append(dict(group=tie_grp[e], elem=e, role="tie", L=norm(dv), Lh=hlen(dv), T=t,
                            EA=cfg["EA"]["tie"], mis=mis))
        if resid and max(resid) > 1e-6 * max(T):
            print(f"  ! {g}：{len(resid)} 個沒有繫索的節點合力不為 0（最大 {max(resid):.3f}），"
                  "耐風索的幾何不是這組繫索的索多邊形；可設 fix_wind 與 tie_T 重算")
    return out


# ---------------------------------------------------------------- 主纜與吊索
def main_system(mct, cfg, ties, rep, gname):
    ld = cfg["loads"]
    ns, el = chain(mct, gname)
    z = [mct.nodes[n][2] for n in ns]
    sad = cfg.get("saddles", {}).get(gname)
    if sad:
        s1, s2 = ns.index(sad[0]), ns.index(sad[1])
    else:                                            # 兩個最高的局部極大值
        peaks = [k for k in range(1, len(ns) - 1) if z[k] >= z[k - 1] and z[k] >= z[k + 1]]
        s1, s2 = sorted(sorted(peaks, key=lambda k: -z[k])[:2])
    P0, P1 = mct.nodes[ns[s1]], mct.nodes[ns[s2]]
    ax = sub(P1, P0); span = hlen(ax); ax = [ax[0] / span, ax[1] / span, 0.0]
    xl = lambda p: (p[0] - P0[0]) * ax[0] + (p[1] - P0[1]) * ax[1]

    # 吊索：上端在這條主纜上的 hanger 元素
    hang = {}
    for g in cfg["hanger"]:
        for e in mct.group_elems(g):
            i, j = mct.elems[e]["i"], mct.elems[e]["j"]
            if i in ns[s1 + 1:s2]: hang[i] = (e, j)
            elif j in ns[s1 + 1:s2]: hang[j] = (e, i)
    hx = sorted((xl(mct.nodes[n]), n) for n in hang)
    # 橋面恆載的分擔長度：相鄰吊點各一半，端吊點另加到塔的一半（梁在塔處有支承）
    trib = {}
    for k, (x, n) in enumerate(hx):
        xa = hx[k - 1][0] if k else 0.0
        xb = hx[k + 1][0] if k + 1 < len(hx) else span
        trib[n] = (xb - xa) / 2
    # 繫索的垂直分力：指派給同側、橋軸位置最近的吊點
    ptie = {n: 0.0 for n in hang}
    for e, tv in ties.items():
        dn = mct.nodes[tv["deck"]]
        best = min(hang, key=lambda n: hlen(sub(mct.nodes[hang[n][1]], dn)))
        if hlen(sub(mct.nodes[hang[best][1]], dn)) < 0.6 * (hx[1][0] - hx[0][0]) + 0.5:
            ptie[best] += -tv["force"][2]
    over = cfg.get("hanger_loads", {})

    for it in range(100):
        Pn = [mct.nodes[n] for n in ns]
        seg = [norm(sub(Pn[k + 1], Pn[k])) for k in range(len(ns) - 1)]
        Nh, Q = {}, {}
        for n, (e, d) in hang.items():
            lh = norm(sub(mct.nodes[d], mct.nodes[n]))
            base = over.get(str(n), ld["deck_per_len"] * trib[n])
            Nh[n] = base + ptie[n] + ld.get("w_hang", 0.0) * lh / 2
        for k in range(s1 + 1, s2):
            n = ns[k]
            Q[n] = ld.get("w_main", 0.0) * (seg[k - 1] + seg[k]) / 2
            if n in hang:
                lh = norm(sub(mct.nodes[hang[n][1]], mct.nodes[n]))
                Q[n] += Nh[n] + ld.get("w_hang", 0.0) * lh / 2 + ld.get("band", 0.0)
        xs = {n: xl(mct.nodes[n]) for n in ns[s1:s2 + 1]}
        R = sum(Q[n] * (span - xs[n]) for n in Q) / span
        M0 = lambda x: R * x - sum(Q[n] * max(0.0, x - xs[n]) for n in Q)
        zc = lambda x: P0[2] + (P1[2] - P0[2]) * x / span
        km = min(range(s1 + 1, s2), key=lambda k: abs(xs[ns[k]] - span / 2))
        f = zc(xs[ns[km]]) - mct.nodes[ns[km]][2]
        H = M0(xs[ns[km]]) / f
        dz = {n: mct.nodes[n][2] - (zc(xs[n]) - M0(xs[n]) / H) for n in ns[s1 + 1:s2]}
        if it == 0:
            dz0 = dz                     # 回報原始幾何與索多邊形的差（修正前）
        if not cfg.get("fix_main_z", False):
            break
        if max(abs(v) for v in dz.values()) < 1e-9:
            break
        for n in ns[s1 + 1:s2]:
            p = mct.nodes[n]
            mct.set_node(n, [p[0], p[1], p[2] - dz[n]])
    # 張力：主纜（含控索）T = H·L/Lh（水平分量各處相同）；吊索 T = Nh
    for k, e in enumerate(el):
        d = sub(mct.nodes[ns[k + 1]], mct.nodes[ns[k]])
        rep.append(dict(group=gname, elem=e, role="main" if s1 <= k < s2 else "backstay",
                        L=norm(d), Lh=hlen(d), T=H * norm(d) / hlen(d), EA=cfg["EA"]["main"]))
    for n, (e, d) in hang.items():
        L = norm(sub(mct.nodes[d], mct.nodes[n]))
        g = next(x for x in cfg["hanger"] if e in mct.group_elems(x))
        rep.append(dict(group=g, elem=e, role="hanger", L=L, Lh=0.0, T=Nh[n],
                        EA=cfg["EA"]["hanger"], ptie=ptie[n]))
    return dict(H=H, f=f, span=span, dz=dz0, n_hang=len(hang), ptie=sum(ptie.values()),
                Wtot=sum(Q.values()))


def run_mct(path, roles, prefix):
    with open(path, encoding="utf-8", errors="replace") as fi:
        mct = Mct(fi.read())
    with open(roles, encoding="utf-8") as fi:
        cfg = json.load(fi)
    kind = cfg.get("output_kind", "Lu")
    print(f"單位：力 {mct.unit[0]}、長度 {mct.unit[1]}（設定檔的載重與 EA 必須用同一組單位）")
    rep = []
    ties = wind_system(mct, cfg, rep)
    if ties:
        mis = max(v["mis"] for v in ties.values())
        tmin = min(v["t"] for v in ties.values()); tmax = max(v["t"] for v in ties.values())
        print(f"繫索 {len(ties)} 根：張力 {tmin:.3f}～{tmax:.3f}；"
              f"繫索方向與耐風索節點合力的最大夾角 {mis:.2f}°")
        if mis > 2.0:
            print("  ! 夾角大於 2°：耐風索的幾何與繫索方向不一致，繫索張力不可靠")
    for g in cfg["main"]:
        r = main_system(mct, cfg, ties, rep, g)
        dzmax = max(abs(v) for v in r["dz"].values()) * 1000
        print(f"{g}：主跨 {r['span']:.3f}，垂度 {r['f']:.4f}，H = {r['H']:.3f}；"
              f"吊索 {r['n_hang']} 根，繫索向下分力合計 {r['ptie']:.3f}；"
              f"原始主纜節點與索多邊形最大差 {dzmax:.1f} mm"
              + ("（已移到索多邊形上）" if cfg.get("fix_main_z") else "（未修正）"))
    for row in rep:
        v = exval(kind, row["L"], row["Lh"], row["T"], row["EA"])
        mct.set_exval(row["elem"], KIND[kind], v)
    # 檔頭註解用英文：.mct 以 ASCII 寫出（midas 以系統 ANSI 讀取），中文會變成 ?
    hdr = [";",
           f"; cable_pretension.py: EXVAL filled for {len(rep)} cable elements"
           f" (kind {kind}, EXVAL2 = {KIND[kind]})",
           "; NOTE: dropping this file back onto midas-curve-gen rebuilds the geometry",
           ";       from the parameter block; EXVAL and moved nodes are NOT kept.",
           ";"]
    with open(prefix + ".mct", "w", encoding="ascii", errors="replace", newline=mct.newline) as fo:
        fo.write(mct.text(hdr))
    with open(prefix + "_report.csv", "w", newline="", encoding="utf-8-sig") as fo:
        wr = csv.writer(fo)
        wr.writerow(["group", "elem", "role", "L", "Lh", "T", "T_horizontal", "EA",
                     "Lu", "Lu_over_L"])
        for r in rep:
            Lu = unstressed(r["L"], r["T"], r["EA"])
            wr.writerow([r["group"], r["elem"], r["role"], fmt(r["L"]), fmt(r["Lh"]),
                         fmt(r["T"]), fmt(r["T"] * r["Lh"] / r["L"]), fmt(r["EA"]),
                         fmt(Lu), f"{Lu / r['L']:.8f}"])
    with open(prefix + "_tie_eq.csv", "w", newline="", encoding="utf-8-sig") as fo:
        wr = csv.writer(fo)
        wr.writerow(["Node", "Load Case", "FX", "FY", "FZ", "MX", "MY", "MZ"])
        for e, v in sorted(ties.items()):
            fx, fy, fz = v["force"]
            wr.writerow([v["deck"], "TIE_EQ", fmt(fx), fmt(fy), fmt(fz), 0, 0, 0])
    print(f"已輸出 {prefix}.mct、{prefix}_report.csv、{prefix}_tie_eq.csv")
    return mct, rep, ties


# ---------------------------------------------------------------- 參數式（第 1 版例題）
def run_demo():
    """單跨＋兩側控索的小規模吊橋（每一索面），與第 1 版程式的輸出相同"""
    L, f, s, z_top = 60.0, 6.0, 3.0, 7.0
    z_deck = lambda x: 0.0
    anchor_L, anchor_R = (-12.0, -1.0), (72.0, -1.0)
    w_deck, w_main, w_hang, p_band = 1.05, 0.05, 0.0155, 0.15
    n_h = int(round(L / s)) - 1
    p_tie = [0.0] * n_h                              # 每個吊點的繫索向下分力（可逐點給）
    EA_main, EA_hang = 1.4e8 * 6.0e-4, 2.0e8 * 2.01e-4
    xh = [(i + 1) * s for i in range(n_h)]
    xc = [0.0] + xh + [L]
    zc = [z_top - 4 * f * x * (L - x) / L ** 2 for x in xc]
    seg_len = lambda: [math.hypot(xc[i + 1] - xc[i], zc[i + 1] - zc[i]) for i in range(len(xc) - 1)]
    for it in range(100):
        lh = [zc[i + 1] - z_deck(xh[i]) for i in range(n_h)]
        seg = seg_len()
        Nh = [w_deck * s + p_tie[i] + w_hang * lh[i] / 2 for i in range(n_h)]
        Q = [Nh[i] + w_hang * lh[i] / 2 + p_band + w_main * (seg[i] + seg[i + 1]) / 2
             for i in range(n_h)]
        R = sum(Q[i] * (L - xh[i]) for i in range(n_h)) / L
        M0 = lambda x: R * x - sum(Q[i] * max(0.0, x - xh[i]) for i in range(n_h))
        H = M0(L / 2) / f
        zn = [z_top - M0(x) / H for x in xc]
        done = max(abs(a - b) for a, b in zip(zn, zc)) < 1e-10
        zc = zn
        if done:
            break
    seg = seg_len()
    lh = [zc[i + 1] - z_deck(xh[i]) for i in range(n_h)]
    Tc = [H * seg[i] / (xc[i + 1] - xc[i]) for i in range(n_h + 1)]
    back = lambda a, t: (math.hypot(t[0] - a[0], t[1] - a[1]),
                         H * math.hypot(t[0] - a[0], t[1] - a[1]) / abs(t[0] - a[0]))
    rows = []
    lb, Tb = back(anchor_L, (0.0, z_top))
    rows.append(("控索-左", anchor_L, (0.0, z_top), lb, Tb, H, EA_main))
    for i in range(n_h + 1):
        rows.append((f"主纜-{i + 1}", (xc[i], zc[i]), (xc[i + 1], zc[i + 1]),
                     seg[i], Tc[i], H, EA_main))
    lb, Tb = back(anchor_R, (L, z_top))
    rows.append(("控索-右", (L, z_top), anchor_R, lb, Tb, H, EA_main))
    for i in range(n_h):
        rows.append((f"吊索-{i + 1}", (xh[i], zc[i + 1]), (xh[i], z_deck(xh[i])),
                     lh[i], Nh[i], 0.0, EA_hang))
    print(f"主纜水平分力 H = {H:.3f} kN（每一索面）")
    print(f"最短吊索 = {min(lh):.4f} m")
    with open("pretension_table.csv", "w", newline="", encoding="utf-8-sig") as fo:
        wr = csv.writer(fo)
        wr.writerow(["element", "x_i", "z_i", "x_j", "z_j", "L", "Pretension_T",
                     "Horizontal_H", "Lu", "Lu_over_L"])
        for name, a, b, l, T, Hh, EA in rows:
            Lu = unstressed(l, T, EA)
            print(f"{name:8s}{l:10.4f}{T:11.3f}{Hh:11.3f}{Lu:11.5f}{Lu / l:11.7f}")
            wr.writerow([name, f"{a[0]:.4f}", f"{a[1]:.4f}", f"{b[0]:.4f}", f"{b[1]:.4f}",
                         f"{l:.5f}", f"{T:.4f}", f"{Hh:.4f}", f"{Lu:.6f}", f"{Lu / l:.8f}"])
    print("已輸出 pretension_table.csv")
    return H, rows


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "--demo":
        run_demo()
    else:
        pre = a[a.index("-o") + 1] if "-o" in a else a[0].rsplit(".", 1)[0] + "_tensioned"
        run_mct(a[0], a[1], pre)
