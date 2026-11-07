"""cable_pretension.py 的驗收測試（只用標準函式庫）：python -m unittest tools/test_cable_pretension.py"""
import io, json, math, os, sys, tempfile, unittest, contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cable_pretension as cp

EX = os.path.join(HERE, "examples")
MCT = os.path.join(EX, "suspension_demo.mct")
ROLES = os.path.join(EX, "suspension_demo_roles.json")


def run(cfg_over=None):
    with open(ROLES, encoding="utf-8") as fi:
        cfg = json.load(fi)
    cfg.update(cfg_over or {})
    d = tempfile.mkdtemp()
    rp = os.path.join(d, "roles.json")
    with open(rp, "w", encoding="utf-8") as fo:
        json.dump(cfg, fo, ensure_ascii=False)
    with contextlib.redirect_stdout(io.StringIO()) as out:
        mct, rep, ties = cp.run_mct(MCT, rp, os.path.join(d, "out"))
    return cfg, mct, rep, ties, d, out.getvalue()


class T01_Standalone(unittest.TestCase):
    def test_demo_H(self):
        with contextlib.redirect_stdout(io.StringIO()):
            cwd = os.getcwd(); os.chdir(tempfile.mkdtemp())
            try:
                H, rows = cp.run_demo()
            finally:
                os.chdir(cwd)
        self.assertAlmostEqual(H, 87.069, places=3)          # 書中第 1 版例題
        self.assertEqual(len(rows), 2 + 20 + 19)             # 控索 2、主纜 20 段、吊索 19 根


class T02_Parsing(unittest.TestCase):
    def test_list_syntax(self):
        self.assertEqual(cp.expand_list("1001to1004 1010to1014by2 7"),
                         [1001, 1002, 1003, 1004, 1010, 1012, 1014, 7])

    def test_read_demo(self):
        with open(MCT, encoding="utf-8") as fi:
            m = cp.Mct(fi.read())
        self.assertEqual(m.unit[:2], ("KGF", "M"))
        self.assertEqual(len(m.group_elems("G_CABLE_L")), 38)
        ns, el = cp.chain(m, "G_CABLE_L")
        self.assertEqual((ns[0], ns[-1], len(el)), (15001, 15039, 38))


class T03_MainSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg, cls.mct, cls.rep, cls.ties, cls.dir, cls.log = run()

    def test_every_cable_filled(self):
        roles = self.cfg["main"] + self.cfg["hanger"] + self.cfg["wind"] + self.cfg["tie"]
        want = {e for g in roles for e in self.mct.group_elems(g)}
        got = {r["elem"] for r in self.rep}
        self.assertEqual(want, got)
        for e in want:
            f = self.mct.lines[self.mct.elem_line[e]].split(",")
            self.assertEqual(len(f), 10)                     # Cable（iSUB=3）固定 10 欄
            self.assertEqual(f[9].strip(), "3")              # EXVAL2 = 3（Lu）
            self.assertGreater(float(f[8]), 0.0)

    def test_lu_shorter_than_chord(self):
        for r in self.rep:
            Lu = cp.unstressed(r["L"], r["T"], r["EA"])
            self.assertLess(Lu, r["L"])

    def test_constant_horizontal_component(self):
        main = [r for r in self.rep if r["group"] == "G_CABLE_L" and r["role"] in ("main", "backstay")]
        Hs = [r["T"] * r["Lh"] / r["L"] for r in main]
        self.assertLess(max(Hs) - min(Hs), 1e-6 * max(Hs))

    def test_node_equilibrium_on_funicular(self):
        """修正後的主纜：每個吊點的垂直平衡 = 吊索力 + 索夾 + 纜與吊索自重"""
        m, ld = self.mct, self.cfg["loads"]
        ns, el = cp.chain(m, "G_CABLE_L")
        T = {r["elem"]: r["T"] for r in self.rep}
        Nh = {r["elem"]: r["T"] for r in self.rep if r["role"] == "hanger"}
        top = {}
        for g in self.cfg["hanger"]:
            for e in m.group_elems(g):
                top[m.elems[e]["i"]] = e
        worst = 0.0
        for k in range(1, len(ns) - 1):
            n = ns[k]
            if n not in top:
                continue
            a = cp.sub(m.nodes[ns[k - 1]], m.nodes[n]); b = cp.sub(m.nodes[ns[k + 1]], m.nodes[n])
            Fz = T[el[k - 1]] * a[2] / cp.norm(a) + T[el[k]] * b[2] / cp.norm(b)
            e = top[n]; lh = cp.norm(cp.sub(m.nodes[m.elems[e]["j"]], m.nodes[n]))
            load = Nh[e] + ld["w_hang"] * lh / 2 + ld["band"] + ld["w_main"] * (cp.norm(a) + cp.norm(b)) / 2
            worst = max(worst, abs(Fz - load))
        self.assertLess(worst, 1e-6)

    def test_output_reparses(self):
        with open(os.path.join(self.dir, "out.mct"), encoding="ascii") as fi:
            txt = fi.read()
        m2 = cp.Mct(txt)
        self.assertEqual(len(m2.nodes), len(self.mct.nodes))
        self.assertEqual(len(m2.elems), len(self.mct.elems))
        self.assertIn("cable_pretension.py", txt)


class T04_WindSystem(unittest.TestCase):
    def test_misaligned_geometry_is_reported(self):
        cfg, m, rep, ties, d, log = run()
        self.assertIn("不是這組繫索的索多邊形", log)
        self.assertGreater(max(v["mis"] for v in ties.values()), 2.0)

    def test_force_density_form_finding(self):
        cfg, m, rep, ties, d, log = run({"fix_wind": True, "tie_T": 250.0})
        self.assertNotIn("不是這組繫索的索多邊形", log)
        for v in ties.values():
            self.assertAlmostEqual(v["t"], 250.0, places=4)
            self.assertLess(v["mis"], 1e-3)

    def test_tie_eq_is_balanced_laterally(self):
        cfg, m, rep, ties, d, log = run({"fix_wind": True, "tie_T": 250.0})
        fy = sum(v["force"][1] for v in ties.values())
        fz = sum(v["force"][2] for v in ties.values())
        self.assertLess(abs(fy), 1e-6)                         # 兩側橫向分力互相抵消
        self.assertLess(fz, 0.0)                               # 繫索把橋面往下拉

    def test_incompatible_tie_tension_is_rejected(self):
        with self.assertRaises(ValueError):
            run({"fix_wind": True, "tie_T": 5000.0})


class T05_EdgeCases(unittest.TestCase):
    def test_main_group_without_backstay(self):
        # 主纜群組只含主跨（兩端點就是塔頂、內部沒有局部極大值）時不能當掉，H 要與完整群組相同
        with open(MCT, encoding="utf-8") as fi:
            txt = fi.read()
        m = cp.Mct(txt)
        for g in ("G_CABLE_L", "G_CABLE_R"):
            ns, el = cp.chain(m, g)
            z = [m.nodes[n][2] for n in ns]
            pk = [k for k in range(1, len(ns) - 1) if z[k] >= z[k - 1] and z[k] >= z[k + 1]]
            old = "   %s, %dto%d, %dto%d, 0" % (g, ns[0], ns[-1], el[0], el[-1])
            new = "   %s, %dto%d, %dto%d, 0" % (g, ns[pk[0]], ns[pk[-1]], el[pk[0]], el[pk[-1] - 1])
            self.assertIn(old, txt)
            txt = txt.replace(old, new)
        d = tempfile.mkdtemp()
        p = os.path.join(d, "nobs.mct")
        with open(p, "w", encoding="utf-8") as fo:
            fo.write(txt)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            cp.run_mct(p, ROLES, os.path.join(d, "out"))
        self.assertIn("H = 29052.140", out.getvalue())

    def test_far_tie_is_reported(self):
        # 同側但離吊點太遠的繫索不計入，且必須印出警告（不可默默丟掉）
        with open(ROLES, encoding="utf-8") as fi:
            cfg = json.load(fi)
        with open(MCT, encoding="utf-8") as fi:
            m = cp.Mct(fi.read())
        ties = {99999: {"deck": 2001, "force": [0.0, 0.0, -100.0]}}
        with contextlib.redirect_stdout(io.StringIO()) as out:
            cp.main_system(m, cfg, ties, [], "G_CABLE_L")
        self.assertIn("垂直分力未計入", out.getvalue())


class T06_ReviewFixes(unittest.TestCase):
    """2026-11 書稿第三、四篇審查後的修正"""
    def _mct(self):
        with open(MCT, encoding="utf-8") as fi:
            return cp.Mct(fi.read())

    def _cfg(self):
        with open(ROLES, encoding="utf-8") as fi:
            return json.load(fi)

    def test_tie_on_other_side_not_counted(self):
        # 窄橋（橋寬 1.2 m < 容許距離 2.0 m）：另一側的繫索不能算進這一條主纜
        def ptie(deck):
            m = self._mct()
            for n in m.nodes:
                m.nodes[n][1] *= 0.5
            ties = {99999: {"deck": deck, "force": [0.0, 0.0, -100.0]}}
            with contextlib.redirect_stdout(io.StringIO()):
                return cp.main_system(m, self._cfg(), ties, [], "G_CABLE_L")["ptie"]
        self.assertAlmostEqual(ptie(2017), 100.0)             # 同側
        self.assertAlmostEqual(ptie(3017), 0.0)               # 另一側

    def test_horizontal_output_rejected_for_vertical_hangers(self):
        with self.assertRaises(ValueError):                   # 鉛直吊索的水平分量為 0，不可輸出
            run({"output_kind": "Horizontal"})

    def test_hanger_report_has_real_horizontal_length(self):
        cfg, m, rep, ties, d, log = run()
        for r in rep:
            if r["role"] == "hanger":
                e = m.elems[r["elem"]]
                self.assertAlmostEqual(r["Lh"], cp.hlen(cp.sub(m.nodes[e["j"]], m.nodes[e["i"]])), places=9)

    def test_zero_wind_H_does_not_crash(self):
        with open(ROLES, encoding="utf-8") as fi:
            loads = dict(json.load(fi)["loads"], w_wind=0.0)
        cfg, m, rep, ties, d, log = run({"wind_H": 0.0, "loads": loads})   # 耐風索不受力：舊版除以 0
        self.assertTrue(all(v["t"] == 0.0 for v in ties.values()))

    def test_two_ties_on_one_wind_node_is_rejected(self):
        m = self._mct()
        cfg = self._cfg()
        g = cfg["tie"][0]
        es = m.group_elems(g)
        e0, e1 = es[0], es[1]
        w0 = m.elems[e0]["i"] if m.elems[e0]["i"] in m.groups[cfg["wind"][0]]["nodes"] else m.elems[e0]["j"]
        f = list(m.elems[e1]["f"]); f[4] = str(w0); m.elems[e1]["i"] = w0
        with self.assertRaises(ValueError):
            with contextlib.redirect_stdout(io.StringIO()):
                cp.wind_system(m, cfg, [])


class T07_ParserAndInputs(unittest.TestCase):
    """2026-11 書稿第一、七篇審查後的修正"""
    def test_list_syntax_case_and_bad_token(self):
        self.assertEqual(cp.expand_list("1TO3 5To9BY2"), [1, 2, 3, 5, 7, 9])
        with self.assertRaises(ValueError):
            cp.expand_list("1to3 abc")

    def test_group_continuation_line(self):
        txt = "*NODE\n 1, 0, 0, 0\n 2, 1, 0, 0\n 3, 2, 0, 0\n*GROUP\n G1, 1 \\\n 2to3, , 0\n"
        m = cp.Mct(txt)
        self.assertEqual(m.groups["G1"]["nodes"], [1, 2, 3])

    def test_saddles_in_reverse_order(self):
        with open(MCT, encoding="utf-8") as fi:
            m = cp.Mct(fi.read())
        ns, el = cp.chain(m, "G_CABLE_L")
        z = [m.nodes[n][2] for n in ns]
        pk = [k for k in range(1, len(ns) - 1) if z[k] >= z[k - 1] and z[k] >= z[k + 1]]
        a, b = ns[pk[0]], ns[pk[-1]]
        cfg, *_ , log = run({"saddles": {"G_CABLE_L": [b, a], "G_CABLE_R": [b + 1000, a + 1000]}})
        self.assertIn("H = 29052.140", log)

    def test_hanger_loads_on_deck_node_is_reported(self):
        cfg, m, rep, ties, d, log = run({"hanger_loads": {"2017": 700.0}})
        self.assertIn("不是任何吊索的上端節點", log)

    def test_tie_eq_one_row_per_deck_node(self):
        cfg, m, rep, ties, d, log = run({"fix_wind": True, "tie_T": 250.0})
        with open(os.path.join(d, "out_tie_eq.csv"), encoding="utf-8-sig") as fi:
            nodes = [r.split(",")[0] for r in fi.read().splitlines()[1:]]
        self.assertEqual(len(nodes), len(set(nodes)))


class T08_Robustness(unittest.TestCase):
    """2026-11-07 附錄審查：未收斂、群組不連續、長度單位"""
    def test_disconnected_group_is_rejected(self):
        txt = ("*NODE\n 1,0,0,0\n 2,1,0,0\n 3,5,0,0\n 4,6,0,0\n 5,5,1,0\n"
               "*ELEMENT\n 1, TENSTR, 1, 1, 1, 2, 0, 3, 0, 3\n 2, TENSTR, 1, 1, 3, 4, 0, 3, 0, 3\n"
               " 3, TENSTR, 1, 1, 4, 5, 0, 3, 0, 3\n 4, TENSTR, 1, 1, 5, 3, 0, 3, 0, 3\n"
               "*GROUP\n G, 1to5, 1to4, 0\n")
        with self.assertRaises(ValueError):
            cp.chain(cp.Mct(txt), "G")

    def test_form_finding_not_converged_is_rejected(self):
        orig = cp.solve
        calls = {"n": 0}
        def wobble(A, b):
            calls["n"] += 1
            x = orig(A, b)
            return [v + (0.01 if calls["n"] % 2 else -0.01) for v in x]
        cp.solve = wobble
        try:
            with self.assertRaises(ValueError):
                run({"fix_wind": True, "tie_T": 250.0})
        finally:
            cp.solve = orig

    def test_length_unit_in_report(self):
        with open(MCT, encoding="utf-8") as fi:
            txt = fi.read()
        m = cp.Mct(txt)
        lines = txt.splitlines()
        for n, k in m.node_line.items():
            x, y, z = m.nodes[n]
            lines[k] = f" {n}, {x*100:.6f}, {y*100:.6f}, {z*100:.6f}"
        cm = "\n".join(lines).replace("KGF, M, KJ", "KGF, CM, KJ", 1)
        d = tempfile.mkdtemp()
        p = os.path.join(d, "cm.mct")
        with open(p, "w", encoding="utf-8") as fo:
            fo.write(cm)
        with open(ROLES, encoding="utf-8") as fi:
            cfg = json.load(fi)
        cfg["loads"] = {k: v / 100 for k, v in cfg["loads"].items()}
        cfg["loads"]["band"] = cfg["loads"]["band"] * 100          # 集中力不換算
        rp = os.path.join(d, "r.json")
        with open(rp, "w", encoding="utf-8") as fo:
            json.dump(cfg, fo)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            cp.run_mct(p, rp, os.path.join(d, "o"))
        self.assertIn("最大差 72.1 mm", out.getvalue())


class T09_ScopeChecks(unittest.TestCase):
    """2026-11-07 第二輪附錄審查：程式適用範圍外的輸入要報錯"""
    def test_inclined_hanger_is_rejected(self):
        txt = ("*UNIT\n KGF, M, KJ, C\n*NODE\n 1,0,0,2\n 2,5,0,1\n 3,10,0,2\n 4,5,1,0\n"
               "*ELEMENT\n 1, TENSTR, 1, 1, 1, 2, 0, 3, 0, 3\n 2, TENSTR, 1, 1, 2, 3, 0, 3, 0, 3\n"
               " 3, TENSTR, 1, 1, 2, 4, 0, 3, 0, 3\n*GROUP\n M, 1to3, 1to2, 0\n H, , 3, 0\n")
        cfg = {"main": ["M"], "hanger": ["H"], "loads": {"deck_per_len": 20.0},
               "EA": {"main": 1e7, "hanger": 1e6}, "saddles": {"M": [1, 3]}}
        with self.assertRaises(ValueError):
            with contextlib.redirect_stdout(io.StringIO()):
                cp.main_system(cp.Mct(txt), cfg, {}, [], "M")

    def test_tie_without_wind_group_is_rejected(self):
        with self.assertRaises(ValueError):
            run({"wind": []})

    def test_vertical_hangers_still_accepted(self):
        cfg, m, rep, ties, d, log = run()
        self.assertTrue(any(r["role"] == "hanger" for r in rep))


class T10_FullReview(unittest.TestCase):
    """2026-11-07 全文技術審查（F03、F04、F16、F17）"""
    PLANE = ("*UNIT\n KN, M, KJ, C\n*NODE\n 1,0,0,7\n 2,30,{y},1\n 3,60,0,7\n 4,30,{y},0\n"
             "*ELEMENT\n 1, TENSTR, 1, 1, 1, 2, 0, 3, 0, 3\n 2, TENSTR, 1, 1, 2, 3, 0, 3, 0, 3\n"
             " 3, TENSTR, 1, 1, 2, 4, 0, 3, 0, 3\n*GROUP\n M, 1to3, 1to2, 0\n H, , 3, 0\n")
    CFG = {"main": ["M"], "hanger": ["H"], "loads": {"deck_per_len": 1.0},
           "EA": {"main": 1e6, "hanger": 1e5}, "saddles": {"M": [1, 3]}, "fix_main_z": True}

    def test_F03_main_node_off_saddle_plane_is_rejected(self):
        # 審查反例：B 點偏離 A–C 鉛直面 1 m，y 向分力 −5 kN 無法平衡，舊版仍宣告收斂
        with self.assertRaises(ValueError) as cm:
            with contextlib.redirect_stdout(io.StringIO()):
                cp.main_system(cp.Mct(self.PLANE.format(y=1)), self.CFG, {}, [], "M")
        self.assertIn("鉛直面", str(cm.exception))

    def test_F03_in_plane_still_balances(self):
        rep = []
        with contextlib.redirect_stdout(io.StringIO()):
            r = cp.main_system(cp.Mct(self.PLANE.format(y=0)), self.CFG, {}, rep, "M")
        self.assertAlmostEqual(r["H"], 30 * 60 / (4 * 6), places=9)   # H = PL/(4f)，P = 30 kN

    def _with_groups(self, enc):
        with open(MCT, encoding="utf-8") as fi:
            txt = fi.read()
        txt = txt.replace("*GROUP\n", "*GROUP\n   上游, , 1001to1002, 0\n   下游, , 3001to3002, 0\n", 1)
        d = tempfile.mkdtemp(); p = os.path.join(d, "in.mct")
        with open(p, "w", encoding=enc, newline="") as fo:
            fo.write(txt)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            cp.run_mct(p, ROLES, os.path.join(d, "o"))
        return open(os.path.join(d, "o.mct"), "rb").read(), out.getvalue()

    def test_F04_non_ascii_group_names_are_kept(self):
        for enc in ("utf-8", "cp950"):
            raw, log = self._with_groups(enc)
            t = raw.decode(enc)
            self.assertIn("上游, , 1001to1002", t)
            self.assertIn("下游, , 3001to3002", t)
            self.assertNotIn("??", t)
            self.assertIn(enc, log)

    def test_F04_ascii_input_still_ascii(self):
        cfg, m, rep, ties, d, log = run()
        open(os.path.join(d, "out.mct"), "rb").read().decode("ascii")

    def test_F16_lu_keeps_low_tension(self):
        # 審查反例：L = 0.1 m、T = 0.003 kN、EA = 10,000 kN：6 位小數寫成 0.1，T 反算為 0
        s = cp.fmt_lu(0.1, 0.003, 1e4)
        self.assertNotEqual(s, "0.1")
        self.assertAlmostEqual(1e4 * (0.1 / float(s) - 1), 0.003, delta=0.003e-3)
        self.assertEqual(cp.fmt_lu(10.0, 1000.0, 1e7), cp.fmt(cp.unstressed(10.0, 1000.0, 1e7)))  # 6 位夠用時不變

    def test_F17_physical_inputs(self):
        for L, T, EA in ((1, -1000, 100), (1, 1, 0), (0, 1, 1), (1, float("nan"), 1), (1, 1, float("inf"))):
            with self.assertRaises(ValueError):
                cp.unstressed(L, T, EA)
        with self.assertRaises(ValueError):
            run({"EA": {"main": -1, "hanger": 4.1e6, "wind": 1e7, "tie": 2.85e6}})

    def test_F17_duplicate_role_and_unhandled_cable(self):
        with self.assertRaises(ValueError) as cm:
            run({"main": ["G_CABLE_L", "G_CABLE_R", "G_CABLE_L"]})
        self.assertIn("同時屬於", str(cm.exception))
        cfg, m, rep, ties, d, log = run({"wind": ["G_WIND_L"], "tie": ["G_WSTAY_L"]})   # 未指定角色：警告並列出
        self.assertIn("不屬於角色設定檔", log)


if __name__ == "__main__":
    unittest.main()
