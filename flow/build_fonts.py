"""吊橋助手（flow.html）的宙黑體子集字型。

只嵌入頁面會出現的字：掃 flow.html、flow/app.js、flow/engine.js 的所有非 ASCII 字元，
加上 ASCII 與常用全形標點，由宙黑體 Zev Hei TC 靜態字型切出 woff2（每個字重約 150 KB）。
介面文字有增加新字時重跑；flow/test_flow.js 會檢查子集是否涵蓋頁面上的每一個字。

用法（需要 fonttools 與 brotli：pip install fonttools brotli）：
    python3 flow/build_fonts.py <宙黑體靜態 TTF 資料夾>
靜態 TTF 在書稿倉庫 midas-civil-book/fonts/zev/（由可變字型切出，見該資料夾 README）。
字型授權：SIL OFL-1.1（flow/fonts/LICENSE.md）。
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOURCES = [os.path.join(ROOT, "flow.html"), os.path.join(HERE, "app.js"), os.path.join(HERE, "engine.js")]
EXTRA = "０１２３４５６７８９～—…·×→←↑↓√≤≥±°²³₀₁ⁿ％（）「」『』、。，；：！？／＋－＝①②③④⑤⑥⑦⑧⑨"
FACES = [("ZevHeiTC-F-400.ttf", "ZevHeiTC-F-400.woff2"),
         ("ZevHeiTC-F-700.ttf", "ZevHeiTC-F-700.woff2"),
         ("ZevHeiTC-N-800.ttf", "ZevHeiTC-N-800.woff2")]


def charset():
    chars = set(chr(c) for c in range(0x20, 0x7F)) | set(EXTRA)
    for p in SOURCES:
        with open(p, encoding="utf-8") as f:
            chars |= {ch for ch in f.read() if ord(ch) > 0x7E}
    return "".join(sorted(chars))


def main(src_dir):
    text = os.path.join(HERE, "fonts", "chars.txt")
    with open(text, "w", encoding="utf-8") as f:
        f.write(charset())
    for ttf, out in FACES:
        subprocess.run(["pyftsubset", os.path.join(src_dir, ttf), f"--text-file={text}", "--flavor=woff2",
                        "--layout-features=*", "--output-file=" + os.path.join(HERE, "fonts", out)], check=True)
        print(out, os.path.getsize(os.path.join(HERE, "fonts", out)), "bytes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
