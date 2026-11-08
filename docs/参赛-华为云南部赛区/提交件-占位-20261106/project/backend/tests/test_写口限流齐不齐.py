"""写口限流齐不齐 —— 10-25 第八轮审计 M8 那条的守门用例（纯静态，不碰现网、不发版）。

要挡的事：一只**新长的写口**没挂门闩，而这件事在原来的测法里根本露头不了——本仓查限流的用例
全是逐条点名的私有注册表（`test_quota_and_invite.py:232`、`test_share_snapshot.py:477`、
`test_landing_page.py:307`、`test_v1_auth_and_link.py:1330`），它们只能证明"我点名的那几只挂了"，
一只谁都没点名的新口永远不进去。而限流这条链上的口子是**每次真打都要花接口额度**的那一族：
一张有效票反复打建分享，把当天那点 msgSecCheck 刷光之后，**所有内容检查变成静默放行**——
公开出口等于没过滤，而且不报错。

所以这一把不点名，直接**枚举**：从 `app/api/routes/*.py` 现读所有 `@router.post/put/patch/delete`
的口，与挂了 `@limiter.limit(...)` 的取差。差集里每一条都必须在下面那份豁免名单里在册并写明理由，
否则红。名单**只许变短不许变长**（挂了闸就从名单里删一行；新加一只没挂的口也要先过一句"为什么不挡"）。

⚠ 顺序：这一把是 M8 的第一步（先把尺子立起来），第二步才按名单挂闸。反了就是假绿——
先挂闸后立尺，中间那一段没有任何东西在看。

    cd backend && .venv/bin/python -m pytest tests/test_写口限流齐不齐.py -v
"""
import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROUTES = BACKEND / "app" / "api" / "routes"
WRITE_VERBS = {"post", "put", "patch", "delete"}

# 10-25 落码那一趟之后**故意没挂门闩**的写口，逐条写清"为什么不挡"。
# 分两族：① 只动自己名下的行、一趟一条 UPDATE/DELETE，服务端不出网——给它们挂分钟档，
#    换来的是正常客户端在连发时撞 429，而那几处 429 会被屏上念成"保存失败"；
# ② 出网烧 msgSecCheck 那两族：分钟档护不住**日**额度，要配的是日窗，档位定多少得他拍
#    （配太紧会把站长自己刚写的那篇挡成失败）。这一族是欠账，不是"不用挡"。
EXEMPT = {
    "assets.py:bind_note_assets": "纯 DB：把已在桶里的 object_key 挂到笔记，一趟一条 INSERT，服务端不出网",
    "assets.py:delete_note_asset": "纯 DB：只删库行，云上对象由客户端删（回体给 file_id），服务端不出网",
    "assets.py:reorder_note_assets": "纯 DB：一次批量 UPDATE 自己名下 ≤9 行",
    "cards.py:drop_note_card": "纯 DB：删自己名下那一行卡片台账；云上对象同样归客户端删",
    "categories.py:create_category": "⚠ 出网（_guard_category_name → msgSecCheck）：该配日窗不是分钟窗；日窗同日已由 M33 那一刀上（每人每天 200 次送检）",
    "categories.py:update_category": "⚠ 出网（_guard_category_name → msgSecCheck）：同上；日窗同日已由 M33 那一刀上（每人每天 200 次送检）",
    "categories.py:reorder_categories": "纯 DB：一次批量 UPDATE，名下最多 8 行",
    "categories.py:delete_category": "纯 DB：单行删，而名下有笔记时本来就被既有闸挡着",
    "notes.py:create_note": "⚠ 出网（_guard_manual_text → msgSecCheck）：该配日窗不是分钟窗；日窗同日已由 M33 那一刀上（每人每天 200 次送检）",
    "notes.py:update_note": "⚠ 出网（enforce_text_safety → msgSecCheck）：同上；日窗同日已由 M33 那一刀上（每人每天 200 次送检）",
    "notes.py:pin_note": "纯 DB：单行 UPDATE 一个布尔，幂等",
    "notes.py:delete_note": "纯 DB：单行硬删＋回 file_ids 给客户端，服务端不出网",
    "shares.py:revoke_share": "纯 DB：把自己名下那张活码置 0，幂等（test_撤回是幂等的钉着）",
    "user.py:update_wallpaper": "纯 DB：单行 UPDATE 一个字符串",
    "user.py:update_language": "纯 DB：单行 UPDATE 一个枚举",
    "v1_account.py:unlink": "纯 DB：摘一条身份行，而'名下只剩这一行'那道闸已经卡在前面",
}
# 名单长度**硬写**：10-25 落码那一趟现数是 50 只写口／挂了 34／在册豁免 16。
# 不许写成 `len(EXEMPT)`——那样往名单里加一行时它也跟着涨，"只许变短"就成了空话。
EXEMPT_SIZE = 16


def _write_endpoints():
    """现读所有写口 → {`文件名:函数名`: 挂了限流没有}。

    只认 `@router.<verb>`（现读全部路由文件用的都是这一个变量名，没有第二个前缀），
    限流认 `limiter.limit(...)`；`@router.get` 不在口径里——GET 的成本与烧额度的都不是这一族。
    """
    out = {}
    for path in sorted(ROUTES.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            verbs, wired = [], False
            for dec in node.decorator_list:
                src = ast.unparse(dec)
                if src.startswith("limiter.limit"):
                    wired = True
                if (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)
                        and isinstance(dec.func.value, ast.Name)
                        and dec.func.value.id == "router" and dec.func.attr in WRITE_VERBS):
                    verbs.append(dec.func.attr)
            if verbs:
                out[f"{path.name}:{node.name}"] = wired
    return out


def test_每只写口要么挂了门闩要么在豁免名单里():
    """新长一只没挂闸的写口，这一步当场红——这是本文件存在的唯一理由。"""
    ends = _write_endpoints()
    loose = sorted(k for k, wired in ends.items() if not wired)
    unregistered = [k for k in loose if k not in EXEMPT]
    assert not unregistered, (
        f"这些写口既没挂 @limiter.limit、也没在豁免名单里在册：{unregistered}。"
        "二选一：挂上门闩（照 shares.create_share 的写法，签名第一参 `request: Request`），"
        "或在 EXEMPT 里写清'这一只为什么不挡'——但名单变长要先过 EXEMPT_SIZE 那一关。"
    )


def test_豁免名单里不许留下已经不存在的口():
    """挂了闸就把它从名单里删掉。留着是假账：下一次读名单的人会以为那只还敞着。"""
    ends = set(_write_endpoints())
    stale = sorted(k for k in EXEMPT if k not in ends)
    assert not stale, f"豁免名单里有 {len(stale)} 条已经不存在的写口：{stale}——删掉那一行"


def test_挂了门闩的不许还赖在豁免名单里():
    """名单与在册两头都算＝同一条既算挡了又算没挡，读的人按哪个都对不上账。"""
    ends = _write_endpoints()
    both = sorted(k for k, wired in ends.items() if wired and k in EXEMPT)
    assert not both, f"这些口已经挂上门闩了，还留在豁免名单里：{both}"


def test_名单只许变短():
    assert len(EXEMPT) == EXEMPT_SIZE, (
        f"豁免名单从 {EXEMPT_SIZE} 条变成了 {len(EXEMPT)} 条。要变长只有一个理由："
        "新写了一只故意不挂闸的写口，而那一句'为什么不挡'得先写在这里。"
    )


def test_挂了门闩的口必须把request写进签名():
    """slowapi 按**参数名**取 request（`extension.py` 里 `kwargs.get("request", ...)`），
    拿不到就 `raise Exception` —— 而 `limiter.enabled = False` 那一档下这段代码根本不跑，
    所以测试全绿而线上第一次真撞限流时才炸。这一条把那种"只在生产执行的错"提前抓到。"""
    bad = []
    for path in sorted(ROUTES.glob("*.py")):
        src = path.read_text(encoding="utf-8")
        for node in ast.walk(ast.parse(src)):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not any(ast.unparse(d).startswith("limiter.limit") for d in node.decorator_list):
                continue
            names = {a.arg for a in node.args.args + node.args.kwonlyargs}
            if "request" not in names:
                bad.append(f"{path.name}:{node.name}")
    assert not bad, f"这些口挂了 @limiter.limit 而签名里没有 request 参数：{bad}"


def test_尺子自己看得见已经挂了闸的那些():
    """负向断言之前先证正向读得出：名单里随便挑三只这一轮挂上的，必须读成"挂了"。

    少了这一条，`_write_endpoints()` 里那个 `startswith("limiter.limit")` 万一写错，
    上面四条会**一起以"全都没挂"的方式红**，或者更糟——全绿而什么都没读出来。
    """
    ends = _write_endpoints()
    for probe in ("shares.py:create_share", "notes.py:import_from_share",
                  "user.py:set_private_password", "user.py:reset_private_password"):
        assert probe in ends, f"尺子没读到这只口：{probe}（口径漂了，不是代码漂了）"
        assert ends[probe], f"{probe} 明明挂了 @limiter.limit，尺子读成没挂"
    assert len([k for k, v in ends.items() if v]) == len(ends) - len(EXEMPT), (
        "总数对不上：挂了的＋在册豁免的 ≠ 全部写口。有人既不在名单也没挂闸却过了上面几条，"
        "那就是枚举口径本身漂了。"
    )
