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
    """無應力長度 Lu = L / (1 + T/EA)；L、EA 須為正的有限值，T 須為非負的有限值（纜索不受壓）"""
    check_phys(L, T, EA)
    return L / (1.0 + T / EA)


def check_phys(L, T, EA, where=""):
    """物理輸入篩選：不合理的值直接報錯，不寫出看似可用的結果"""
    w = f"{where}：" if where else ""
    for name, v in (("長度 L", L), ("張力 T", T), ("EA", EA)):
        if not isinstance(v, (int, float)) or not math.isfinite(v):
            raise ValueError(f"{w}{name} = {v!r} 不是有限的數值")
    if L <= 0:
        raise ValueError(f"{w}長度 L = {L} 必須大於 0（零長元素）")
    if EA <= 0:
        raise ValueError(f"{w}EA = {EA} 必須大於 0")
    if T < 0:
        raise ValueError(f"{w}張力 T = {T} 為負：纜索不能受壓，請檢查載重與 hanger_loads 的正負號")


def exval(kind, L, Lh, T, EA):
    """依輸出種類回傳 EXVAL：Lu（長度）、Pretension（力）、Horizontal（張力的水平分量）"""
    if kind == "Lu":
        return unstressed(L, T, EA)              # 寫入 MCT 時以 fmt_lu 決定位數
    if kind == "Pretension":
        return T
    if kind == "Horizontal":
        return T * Lh / L
    raise ValueError("output_kind 只能是 Lu、Pretension 或 Horizontal")


def fmt(v):
    s = f"{v:.6f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def fmt_lu(L, T, EA, rel=1e-3):
    """Lu 的輸出字串：小數 6 位不夠時逐位加到 12 位，直到以寫出的 Lu 反算的張力
    EA·(L/Lu − 1) 與 T 的差在 rel·T 以內（低張力、短構件時 6 位會把 T 捨成 0）"""
    Lu = unstressed(L, T, EA)
    tol = max(rel * abs(T), 1e-12 * EA)
    for nd in range(6, 13):
        s = f"{Lu:.{nd}f}".rstrip("0").rstrip(".")
        if abs(EA * (L / float(s) - 1.0) - T) <= tol:
            return s
    raise ValueError(f"Lu = {Lu!r} 以 12 位小數寫出仍無法保留張力 T = {T}（相對誤差要求 {rel:g}）；"
                     "請改用 output_kind = Pretension，或改用較小的長度單位")


# ---------------------------------------------------------------- MCT 讀寫
def expand_list(text):
    """midas 的清單語法：1001to1011、1001to1051by2、單一編號，以空白分隔（大小寫不拘）"""
    out = []
    for tok in text.split():
        m = re.fullmatch(r"(\d+)to(\d+)(?:by(\d+))?", tok, re.I)
        if m:
            a, b, s = int(m.group(1)), int(m.group(2)), int(m.group(3) or 1)
            out.extend(range(a, b + 1, s))
        elif tok.isdigit():
            out.append(int(tok))
        else:
            raise ValueError(f"無法解析的節點／元素清單項目：{tok!r}")
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
        sec, cont = None, ""
        for k, raw in enumerate(self.lines):
            s = raw.strip()
            if s.startswith("*") and not cont:
                sec = s.split()[0].split(";")[0].upper()
                continue
            data = s.split(";")[0].strip()
            if data.endswith("\\"):                 # midas 的續行符號：長清單分成多行
                cont += data[:-1] + " "
                continue
            data, cont = cont + data, ""
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
        f[7], f[8], f[9] = "3", value if isinstance(value, str) else fmt(value), str(kind_code)
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
    if len(el) != len(es) or len(set(ns)) != len(ns):      # 走不到的元素：群組分成好幾段或含閉環
        raise ValueError(f"群組 {gname} 有 {len(es) - len(el)} 根元素沒有連在同一條節點串上"
                         "（分成好幾段或含閉環）")
    miss = len(mct.groups[gname]["elems"]) - len(es)
    if miss:
        raise ValueError(f"群組 {gname} 列了 {miss} 個 *ELEMENT 中不存在的元素編號")
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
    else:                                            # 用完迭代次數仍未收斂：不寫回節點
        raise ValueError(f"耐風索力密度法 200 次未收斂（最後一次節點移動 {move:.3g}）；"
                         "請檢查 wind_H、tie_T 與幾何，未輸出 .mct")
    for n in free:
        mct.set_node(n, P[n])
    return it + 1


def wind_system(mct, cfg, rep):
    """依 H_w 求每根繫索的張力與它作用在橋面節點的力（向量）"""
    Hw, out = cfg.get("wind_H", 0.0), {}
    w_w = cfg["loads"].get("w_wind", 0.0)
    tie_of, tie_grp, n_tie = {}, {}, {}               # 耐風索節點 → (繫索元素, 橋面節點)
    for g in cfg.get("tie", []):
        for e in mct.group_elems(g):
            i, j = mct.elems[e]["i"], mct.elems[e]["j"]
            tie_of[i] = (e, j); tie_of[j] = (e, i); tie_grp[e] = g
            n_tie[i] = n_tie.get(i, 0) + 1; n_tie[j] = n_tie.get(j, 0) + 1
    if cfg.get("tie") and not cfg.get("wind"):
        raise ValueError("設定了繫索（tie）群組卻沒有耐風索（wind）群組：本程式只處理型式 A（耐風索＋繫索）；"
                         "型式 B 的直線支索請以設計初張力手算各附掛點的向下分力，填入 hanger_loads")
    for g in cfg.get("wind", []):
        ns, el = chain(mct, g)
        dup = [n for n in ns[1:-1] if n_tie.get(n, 0) > 1]
        if dup:
            raise ValueError(f"{g}：耐風索節點 {dup[0]} 等 {len(dup)} 處接了兩根以上繫索；"
                             "本程式假設每個耐風索節點只接一根繫索，請拆開節點或改以 3D 模型找形")
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
            if t < 1e-12:                            # wind_H = 0 或節點恰好平衡：繫索不受力
                mis = 0.0
            else:
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
        s1, s2 = sorted((ns.index(sad[0]), ns.index(sad[1])))   # 填的順序與節點串方向無關
    else:                                            # 兩個最高的局部極大值
        peaks = [k for k in range(1, len(ns) - 1) if z[k] >= z[k - 1] and z[k] >= z[k + 1]]
        if len(peaks) < 2:                           # 群組不含控索：兩端點就是塔頂
            peaks = sorted(set(peaks + [0, len(ns) - 1]))
        s1, s2 = sorted(sorted(peaks, key=lambda k: -z[k])[:2])
    P0, P1 = mct.nodes[ns[s1]], mct.nodes[ns[s2]]
    ax = sub(P1, P0); span = hlen(ax); ax = [ax[0] / span, ax[1] / span, 0.0]
    xl = lambda p: (p[0] - P0[0]) * ax[0] + (p[1] - P0[1]) * ax[1]
    # 本程式是平面索多邊形：主跨節點必須在兩索鞍決定的鉛直面上，否則橫向分力無法平衡
    off = max((abs(-(mct.nodes[n][0] - P0[0]) * ax[1] + (mct.nodes[n][1] - P0[1]) * ax[0]), n)
              for n in ns[s1 + 1:s2])
    if off[0] > 1e-4 * span:
        raise ValueError(f"{gname}：主跨節點 {off[1]} 偏離兩索鞍（節點 {ns[s1]}、{ns[s2]}）的鉛直面 {off[0]:.4g}；"
                         "本程式只處理平面主纜，空間主纜須以三維找形計算，未輸出 .mct")

    # 吊索：上端在這條主纜上的 hanger 元素
    hang = {}
    for g in cfg["hanger"]:
        for e in mct.group_elems(g):
            i, j = mct.elems[e]["i"], mct.elems[e]["j"]
            if i in ns[s1 + 1:s2]: hang[i] = (e, j)
            elif j in ns[s1 + 1:s2]: hang[j] = (e, i)
    hx = sorted((xl(mct.nodes[n]), n) for n in hang)
    # 橋面恆載的分擔長度：到前、後吊點距離各取一半；端吊點的「前一點」是塔（梁在塔處有支承，另一半由支承承受）
    trib = {}
    for k, (x, n) in enumerate(hx):
        xa = hx[k - 1][0] if k else 0.0
        xb = hx[k + 1][0] if k + 1 < len(hx) else span
        trib[n] = (xb - xa) / 2
    # 繫索的垂直分力：指派給同側、橋軸位置最近的吊點
    ptie = {n: 0.0 for n in hang}
    um = {"M": 1.0, "CM": 100.0, "MM": 1000.0, "FT": 3.28084, "IN": 39.3701}.get(mct.unit[1].upper(), 1.0)
    tol = 0.6 * (hx[1][0] - hx[0][0]) + 0.5 * um if len(hx) > 1 else 2.0 * um   # 0.5 m、2.0 m 換成模型長度單位
    # 全橋所有吊索的下端（較低的端點）：繫索先找全橋最近的吊點，屬於另一條主纜的就不在這裡計入
    low_all = set()
    for g in cfg["hanger"]:
        for e in mct.group_elems(g):
            i, j = mct.elems[e]["i"], mct.elems[e]["j"]
            low_all.add(i if mct.nodes[i][2] < mct.nodes[j][2] else j)
    mine = {d for (e, d) in hang.values()}
    for e, tv in ties.items():
        dn = mct.nodes[tv["deck"]]
        if low_all:
            g_best = min(low_all, key=lambda d: hlen(sub(mct.nodes[d], dn)))
            if g_best not in mine:                    # 另一側（另一條主纜）的吊點較近
                continue
        best = min(hang, key=lambda n: hlen(sub(mct.nodes[hang[n][1]], dn)))
        d = hlen(sub(mct.nodes[hang[best][1]], dn))
        if d < tol:
            ptie[best] += -tv["force"][2]
        else:                                         # 同側（全橋最近的吊點在這條主纜上）卻離吊點太遠
            print(f"  ! 繫索 {e}（橋面節點 {tv['deck']}）距最近吊點 {d:.2f} {mct.unit[1].lower()}，"
                  "垂直分力未計入吊索與主纜初張力")
    over = cfg.get("hanger_loads", {})
    up_all = set()                                    # 全橋所有吊索的上端（較高的端點）
    for g in cfg["hanger"]:
        for e in mct.group_elems(g):
            i, j = mct.elems[e]["i"], mct.elems[e]["j"]
            up_all.add(i if mct.nodes[i][2] >= mct.nodes[j][2] else j)
    bad = [k for k in over if int(k) not in up_all]
    if bad and gname == cfg["main"][0]:
        print(f"  ! hanger_loads 的鍵 {bad[:3]} 不是任何吊索的上端節點，已略過"
              "（鍵要填吊索上端、主纜上的節點編號，不是橋面節點）")

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
        if it == 99:
            raise ValueError(f"{gname}：主纜索多邊形 100 次未收斂（最大差 {max(abs(v) for v in dz.values()):.3g}）")
        for n in ns[s1 + 1:s2]:
            p = mct.nodes[n]
            mct.set_node(n, [p[0], p[1], p[2] - dz[n]])
    if not (math.isfinite(H) and H > 0 and f > 0):
        raise ValueError(f"{gname}：垂度 f = {f:.4g}、H = {H:.4g} 不合理（主纜須在塔頂連線下方、"
                         "載重向下），請檢查節點座標、索鞍節點與載重符號")
    if cfg.get("fix_main_z", False):                 # 修正後逐節點檢查三方向的殘差，達標才算平衡
        res = 0.0
        for k in range(s1 + 1, s2):
            a, b = sub(mct.nodes[ns[k - 1]], mct.nodes[ns[k]]), sub(mct.nodes[ns[k + 1]], mct.nodes[ns[k]])
            la, lb = abs(a[0] * ax[0] + a[1] * ax[1]), abs(b[0] * ax[0] + b[1] * ax[1])
            F = add(mul(a, H / la), mul(b, H / lb))
            F[2] -= Q[ns[k]]
            res = max(res, norm(F))
        if res > 1e-6 * H:
            raise ValueError(f"{gname}：修正後主纜節點的三方向殘差 {res:.4g} 超過 1e-6·H，未輸出 .mct")
    # 張力：主纜（含控索）T = H·L/Lx，Lx 為沿橋軸（塔頂連線）的投影長——塔頂沿橋軸的分量平衡；
    # 控索在平面上外展（與橋軸夾角不為 0）時，它的水平分量 T·Lh/L 會大於 H
    for k, e in enumerate(el):
        d = sub(mct.nodes[ns[k + 1]], mct.nodes[ns[k]])
        lx = abs(d[0] * ax[0] + d[1] * ax[1])
        if lx < 1e-9:
            raise ValueError(f"{gname} 的元素 {e} 與橋軸垂直，無法以沿橋軸的 H 計算張力")
        rep.append(dict(group=gname, elem=e, role="main" if s1 <= k < s2 else "backstay",
                        L=norm(d), Lh=hlen(d), T=H * norm(d) / lx, EA=cfg["EA"]["main"]))
    for n, (e, d) in hang.items():
        dv = sub(mct.nodes[d], mct.nodes[n])
        L = norm(dv)
        if hlen(dv) > 0.01 * L:                      # 本程式以 T = Nh 計吊索張力，只適用鉛直吊索
            raise ValueError(f"吊索 {e} 不是鉛直（水平投影 {hlen(dv):.3f}、長 {L:.3f}）；"
                             "本程式只處理鉛直吊索與鉛直索面，傾斜吊索須以 3D 節點平衡另行計算")
        g = next(x for x in cfg["hanger"] if e in mct.group_elems(x))
        rep.append(dict(group=g, elem=e, role="hanger", L=L, Lh=hlen(dv), T=Nh[n],
                        EA=cfg["EA"]["hanger"], ptie=ptie[n]))
    return dict(H=H, f=f, span=span, dz=dz0, n_hang=len(hang), ptie=sum(ptie.values()),
                Wtot=sum(Q.values()))


def read_text(path):
    """依序以 UTF-8、cp950（繁中 Windows 的 ANSI）解碼；都不行就報錯，不默默替換字元"""
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp950"):
        try:
            return raw.decode(enc).replace("\r\n", "\n").replace("\r", "\n"), enc   # 與文字模式讀檔相同的換行處理
        except UnicodeDecodeError:
            pass
    raise ValueError(f"{path} 不是 UTF-8 或 cp950 編碼，無法保證原樣寫回；請由 midas 重新匯出")


def run_mct(path, roles, prefix):
    text, enc = read_text(path)
    mct = Mct(text)
    with open(roles, encoding="utf-8") as fi:
        cfg = json.load(fi)
    kind = cfg.get("output_kind", "Lu")
    print(f"單位：力 {mct.unit[0]}、長度 {mct.unit[1]}（設定檔的載重與 EA 必須用同一組單位）")
    for r in ("main", "hanger") + (("wind", "tie") if cfg.get("wind") else ()):
        ea = cfg.get("EA", {}).get(r)
        if not isinstance(ea, (int, float)) or not math.isfinite(ea) or ea <= 0:
            raise ValueError(f"角色設定檔 EA.{r} = {ea!r}：必須是正的有限數值")
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
        to_mm = {"M": 1000.0, "CM": 10.0, "MM": 1.0, "FT": 304.8, "IN": 25.4}.get(mct.unit[1].upper())
        if to_mm is None:
            raise ValueError(f"不認得的長度單位 {mct.unit[1]}（可用 M、CM、MM、FT、IN）")
        dzmax = max(abs(v) for v in r["dz"].values()) * to_mm
        print(f"{g}：主跨 {r['span']:.3f}，垂度 {r['f']:.4f}，H = {r['H']:.3f}；"
              f"吊索 {r['n_hang']} 根，繫索向下分力合計 {r['ptie']:.3f}；"
              f"原始主纜節點與索多邊形最大差 {dzmax:.1f} mm"
              + ("（已移到索多邊形上）" if cfg.get("fix_main_z") else "（未修正）"))
    if kind == "Horizontal":
        steep = [r["elem"] for r in rep if r["Lh"] < 0.05 * r["L"]]
        if steep:                                    # 鉛直吊索的水平分量為 0：寫出去就是錯的初張力
            raise ValueError(f"{len(steep)} 根纜索接近鉛直（例如 {steep[0]}），水平分量無法代表張力；"
                             "請改用 output_kind = Lu 或 Pretension，未輸出 .mct")
    seen = {}
    for row in rep:                                   # 同一元素被歸到兩種角色：初張力會互相覆蓋
        if row["elem"] in seen:
            raise ValueError(f"元素 {row['elem']} 同時屬於 {seen[row['elem']]} 與 {row['group']}（{row['role']}），"
                             "請檢查角色設定檔的群組，未輸出 .mct")
        seen[row["elem"]] = f"{row['group']}（{row['role']}）"
        check_phys(row["L"], row["T"], row["EA"], f"{row['group']} 元素 {row['elem']}")
    left = sorted(e for e, v in mct.elems.items() if v["type"].upper() == "TENSTR" and e not in seen)
    if left:                                          # 沒有角色的纜索留著原本的 EXVAL，不會填入初張力
        print(f"  ! {len(left)} 根 TENSTR 元素不屬於角色設定檔的任何群組（例如 {left[:5]}），"
              "EXVAL 原樣保留、沒有填入初張力；若是控索等另成群組的纜索，請在 midas 另行輸入")
    for row in rep:
        if kind == "Lu":
            v = fmt_lu(row["L"], row["T"], row["EA"])
        else:
            v = exval(kind, row["L"], row["Lh"], row["T"], row["EA"])
        mct.set_exval(row["elem"], KIND[kind], v)
    # 檔頭註解用英文。原檔全為 ASCII 就以 ASCII 寫出（midas 以系統 ANSI 讀取）；
    # 原檔含中文等非 ASCII 字元（群組名、載重名稱、註解）時沿用原編碼寫回，不把它們換成 ?——
    # 換成 ? 會讓不同的中文群組名變成同名群組
    out_enc = "ascii" if text.isascii() else enc.replace("-sig", "")
    if out_enc != "ascii":
        print(f"  ! 原檔含非 ASCII 字元，以原編碼 {out_enc} 寫回（midas 以系統 ANSI 讀取：繁中 Windows 為 cp950）")
    hdr = [";",
           f"; cable_pretension.py: EXVAL filled for {len(rep)} cable elements"
           f" (kind {kind}, EXVAL2 = {KIND[kind]})",
           "; NOTE: dropping this file back onto midas-curve-gen rebuilds the geometry",
           ";       from the parameter block; EXVAL and moved nodes are NOT kept.",
           ";"]
    with open(prefix + ".mct", "w", encoding=out_enc, newline=mct.newline) as fo:
        fo.write(mct.text(hdr))
    with open(prefix + "_report.csv", "w", newline="", encoding="utf-8-sig") as fo:
        wr = csv.writer(fo)
        wr.writerow(["group", "elem", "role", "L", "Lh", "T", "T_horizontal", "EA",
                     "Lu", "Lu_over_L"])
        for r in rep:
            Lu = unstressed(r["L"], r["T"], r["EA"])
            wr.writerow([r["group"], r["elem"], r["role"], fmt(r["L"]), fmt(r["Lh"]),
                         fmt(r["T"]), fmt(r["T"] * r["Lh"] / r["L"]), fmt(r["EA"]),
                         fmt_lu(r["L"], r["T"], r["EA"]), f"{Lu / r['L']:.8f}"])
    with open(prefix + "_tie_eq.csv", "w", newline="", encoding="utf-8-sig") as fo:
        wr = csv.writer(fo)
        wr.writerow(["Node", "Load Case", "FX", "FY", "FZ", "MX", "MY", "MZ"])
        tot = {}                                      # 同一橋面節點接多根繫索時合併成一列
        for e, v in sorted(ties.items()):
            t = tot.setdefault(v["deck"], [0.0, 0.0, 0.0])
            for c in range(3):
                t[c] += v["force"][c]
        for n in sorted(tot):
            fx, fy, fz = tot[n]
            wr.writerow([n, "TIE_EQ", fmt(fx), fmt(fy), fmt(fz), 0, 0, 0])
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
