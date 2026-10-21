#!/usr/bin/env python3
"""反向验证：把 `tests/test_admin_fusion.py` 里 ⑦ 那一组十条钉子逐条打掉，看它会不会真的红。

为什么要有这一把：这一轮我写的判据全是"读那一页源码里的字符串"，这种判据最容易长成没牙的——
锚写错了、或者那句本来就不在源码里，跑起来照样绿。所以每条钉子都要配一次"撤掉它"的实验。

怎么做到不碰正本：把 ops_page.py 抄一份到 /tmp，改的是副本，然后拿 `OPS_PAGE_SRC` 那枚环境变量
把测试指到副本上（⑦ 那一组十条都走 `_ops_body()` 读这个变量）。正本一个字节没动，
现网更没碰。

**每一趟只用 `-k` 挑那一条静态钉子，不整批跑这一只文件**：① 那组验票口的用例真发请求，
而它们的额度记在 Redis 的固定窗口里、跨进程累计（`app/core/rate_limit.py` 那枚 limiter）。
这一把要连跑十几趟 pytest，整批跑的话从第二趟起那 5 条会被打成 429——我 10-21 就这么撞红过一回，
那不是判据红，是额度红。⑦ 那一组十条只读源码字符串，不发请求，随便跑。

跑法（cwd 要指到仓库根，脚本自己算 backend）：
    cd /Users/zlfmac/Documents/TuMaiBiJi && backend/.venv/bin/python docs/工具/反向探针-后台那一屏交互.py
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # 工具/ → docs/ → 仓库根
BACKEND = ROOT / "backend"
PAGE = BACKEND / "app/api/routes/ops_page.py"
TMP = Path("/tmp/ops-reverse-20261021")
# ⑦ 那一组的十条（用 `-k` 挑它们做"正本全绿"这一道前置，避开 429 那组）
GROUP = "染橙 or 真结果 or 只出那一张 or 高亮 or 折叠 or 滚动位置 or 留得住 or 语义 or 横滚壳 or 下限"
绿 = "10 passed"

# (这一撤要红的钉子, 用例名, 从 → 到)。`到` 一律写成能一眼认出的"旧写法"，不是随便换个字符。
CASES = [
    ("藏卡的扫描限定在主区", "test_点左栏那条只出那一张卡",
     [('document.querySelectorAll(\'#main .card[data-key]\')', 'document.querySelectorAll(\'.card[data-key]\')')]),
    ("只藏左栏那 14 条各自那张卡", "test_点左栏那条只出那一张卡",
     [("if (NAVKEYS[k]) all[j].classList.toggle('hidden', k !== key);", "all[j].classList.toggle('hidden', k !== key);")]),
    ("那一张卡不在时不许把整栏藏光", "test_点左栏那条只出那一张卡",
     [("  if (!hit) return;\n", "")]),
    ("配置栏重画完补一遍藏卡", "test_点左栏那条只出那一张卡",
     [("  resyncDirty();\n  repaintFocus();\n}", "  resyncDirty();\n}")]),
    ("数据栏重画完补一遍藏卡", "test_点左栏那条只出那一张卡",
     [("cards[i].dataset.key = keys[i];\n  repaintFocus();", "cards[i].dataset.key = keys[i];")]),
    ("模板栏重画完补一遍藏卡", "test_点左栏那条只出那一张卡",
     [("  repaintFocus();\n\n  // 回执落在", "\n  // 回执落在")]),
    ("滚过去那一套撤净", "test_点左栏那条只出那一张卡",
     [("window.scrollTo(0, 0);", "document.querySelector('#main [data-key=\"' + it.key + '\"]').scrollIntoView({ block: 'start' });")]),
    ("滚动跟随没留回魂的口子", "test_滚动不再改高亮切栏也不许留空白",
     [("var FOCUS = '';", "var FOCUS = ''; var navLock = 0;")]),
    ("切栏退回那一栏第一条", "test_滚动不再改高亮切栏也不许留空白",
     [("    showKey(VIEW_FIRST[v]);\n", "")]),
    ("模板栏一次只开一套", "test_卡片模板那一栏默认折叠一次只开一套",
     [("for (var i = 0; i < cs.length; i++) tplFold(cs[i], open && cs[i].dataset.id === String(r.id));",
       "tplFold(card, open);")]),
    ("回执那一行自动展开", "test_卡片模板那一栏默认折叠一次只开一套",
     [("TPL_OPEN = String(flash.id);", "")]),
    ("预览等点开才画", "test_卡片模板那一栏默认折叠一次只开一套",
     [("if (!box || box._painted) return;", "if (!box) return;")]),
    ("折叠体那一层", "test_卡片模板那一栏默认折叠一次只开一套",
     [("var body = el('div', 'tplbody');", "var body = el('div', 'whatever');")]),
    ("那一枚的话跟着展开状态走", "test_卡片模板那一栏默认折叠一次只开一套",
     [("t.textContent = open ? '收起这一套' : '展开这一套';", "t.textContent = '展开这一套';")]),
    ("模板行不许带上左栏的 key", "test_卡片模板那一栏默认折叠一次只开一套",
     [("card.dataset.id = r.id;", "card.dataset.id = r.id; card.dataset.key = 'tpl:' + r.id;")]),
    ("put 把 promise 递回去", "test_置灰那几枚等的是真结果",
     [("function put(kind, assetId, msg, done) {\n  msg.textContent = '';\n  return api(",
       "function put(kind, assetId, msg, done) {\n  msg.textContent = '';\n  api(")]),
    ("保存那一枚把请求递回去", "test_置灰那几枚等的是真结果",
     [("busyRun(btnSave, '保存中…', function () {\n      return api(", "busyRun(btnSave, '保存中…', function () {\n      api(")]),
    ("拉黑那一枚的二次确认", "test_改线上那几枚一律先染橙再点第二下",
     [("arm(btnAdd,", "armX(btnAdd,")]),
    ("重画统计时保住滚动位置", "test_换窗口重画不许丢掉滚动位置",
     [("keepScroll(function () { renderStats(d); });", "renderStats(d);")]),
    ("重画完重算角标", "test_没保存的草稿要留得住也要看得见",
     [("resyncDirty();", ";")]),
    ("角标那句实话", "test_没保存的草稿要留得住也要看得见",
     [("card._dirty.textContent = n ? ('有 ' + n + ' 处没保存') : '';", "card._dirty.textContent = '';")]),
    ("左栏那条的真 button 语义", "test_键盘和读屏那一套语义",
     [("el('button', 'navitem', it.label)", "el('s', 'navitem', it.label)")]),
    ("窄屏把触摸目标抬到 44", "test_窄屏那一档触摸目标与横滚壳",
     [("min-height:44px", "min-height:28px")]),
    ("历史那一排的横滚壳", "test_窄屏那一档触摸目标与横滚壳",
     [(".swatches { display:flex; gap:10px; margin-top:10px; overflow-x:auto; -webkit-overflow-scrolling:touch }",
       ".swatches { display:flex; gap:10px; margin-top:10px }")]),
    ("每一枚缩略图定宽", "test_窄屏那一档触摸目标与横滚壳",
     [("flex:none; width:90px; box-sizing:border-box", "flex:none")]),
    ("那句确认改回用 hidden 切", "test_窄屏那一档触摸目标与横滚壳",
     [("one.classList.remove('arm');", "one.classList.remove('arm'); ask.classList.add('hidden');")]),
    ("小字那档的底色", "test_小字那两档的对比度下限",
     [("--muted:#5f636c", "--muted:#a2a49c")]),
]


def run_pytest(src: Path, kexpr: str):
    env = dict(os.environ, OPS_PAGE_SRC=str(src))
    p = subprocess.run([sys.executable, "-m", "pytest", "tests/test_admin_fusion.py",
                        "-q", "-rf", "-p", "no:cacheprovider", "-k", kexpr],
                       cwd=str(BACKEND), env=env, capture_output=True, text=True)
    return p.returncode, p.stdout


def main() -> int:
    if not TMP.exists():
        TMP.mkdir(parents=True)
    base = PAGE.read_text(encoding="utf-8")
    # 先确认正本上这一组是全绿的：反向验证的前提是"照原样跑要过"。
    rc, out = run_pytest(PAGE, GROUP)
    if rc != 0 or 绿 not in out:
        print("FAIL  正本 ⑦ 那一组就不是十条全绿，反向验证没有意义：\n" + out[-1500:])
        return 1
    print("正本：⑦ 那一组十条全绿（只读源码，不碰 Redis 那组额度）")

    bad = []
    for i, (label, test_name, edits) in enumerate(CASES):
        mutated = base
        for a, b in edits:
            if a not in mutated:
                print(f"SKIP  「{label}」那句锚在源码里找不到：{a[:60]}\n      → 这条反向验证没做成，判据也可能是假的")
                bad.append(label + "（锚找不到）")
                mutated = None
                break
            mutated = mutated.replace(a, b)
        if mutated is None:
            continue
        src = TMP / f"case{i:02d}-ops_page.py"
        src.write_text(mutated, encoding="utf-8")
        rc, out = run_pytest(src, test_name)
        lines = [l for l in out.splitlines() if l.startswith("FAILED")]
        hit = [l for l in lines if test_name in l]
        if rc == 0:
            print(f"FAIL  撤掉「{label}」之后竟然还全绿 → {test_name} 这条判据没牙")
            bad.append(label + "（撤了不红）")
        elif not hit:
            print(f"FAIL  撤掉「{label}」是红了，但红的不是该红的那条：{lines}")
            bad.append(label + "（红错地方）")
        elif len(lines) != 1:
            print(f"FAIL  撤掉「{label}」红了 {len(lines)} 条，这一趟只挑了一条：{lines}")
            bad.append(label + f"（红了 {len(lines)} 条）")
        else:
            print(f"ok    撤掉「{label}」→ {test_name} 红")
    shutil.rmtree(TMP, ignore_errors=True)
    if bad:
        print("\n没做成／不合格的 " + str(len(bad)) + " 条：")
        for b in bad:
            print("  · " + b)
        return 1
    print("\n" + str(len(CASES)) + " 条撤一样红一条，⑦ 那一组判据都有牙")
    return 0


if __name__ == "__main__":
    sys.exit(main())
