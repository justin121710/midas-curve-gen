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


if __name__ == "__main__":
    unittest.main()
