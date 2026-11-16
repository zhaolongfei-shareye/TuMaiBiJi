#!/usr/bin/env python3
# 第十轮审计 Z61 那把刀的尺子：清扫探针游客号脚本（docs/工具/清扫-探针游客号.py）。
#
# 做法：临时目录里现建一只真 SQLite 库（真表、真外键、真触发器），把**工具字节**当子进程跑、
#       cwd 就定在那只目录。判据一律**从跑完的库里外部数出来**，不信工具自己念的那几行——
#       这条刀原来的坑正是"工具念着删完了、真人的账号却没了"，只看屏上话的尺子会跟着一起假绿。
#
# 五档库形状：
#   混账   —— 探针与真人共用一枚 account_id（Z61 说的那种并过账）＋一枚纯探针账号＋一枚无账号
#             探针＋一枚 uuid 型游客（绝不该动）＋库里本来就有的孤儿账号（判据按增量不按绝对值）
#   没探针 —— 一个 guest:probe% 都没有
#   没库   —— 目录里压根没有 wtsj.db（cwd 跑错那一档；旧版 connect("wtsj.db") 就在这儿新建空库）
#   缺表   —— 库在但没有 users 表（吃的不是现网那只库）
#   崩半路 —— 混账形状＋notes 上一枚必抛的触发器 ⇒ 前五张子表已删、删 notes 当场抛
#
# ⚠ 归属闸的锚点是 `drop = [a for a in acc if own.get(a, 0) == 0]` 那一行，**不是** `keep` 那一行：
#   删除语句吃的是 drop，keep 只喂「要留的账号没被碰」那条回读与屏上那句念话。第一次跑这把握过 keep，
#   五档反向全绿＝假牙（删的东西一模一样，只是没人念了），改锚 drop 之后才有牙。
#
# 反向变体（在字节上现场改锚点，再跑同一批外部判据）：
#   A 撤归属闸（drop 变成 acc 全撤）→ 真人的账号行与两条身份行一起没 ⇒ users 指空账号那条不变量自己红
#     ⇒ 整批回滚 ⇒ 退 1、库里原样（这一档量的是"不变量不靠归属闸也拦得住"）
#   B A＋红不回滚 → 真人账号与身份行真的没了、users 行还在＝下次登录撞孤儿（后果留在盘上），退 1
#   C A＋退出码写死 0 → B 的形状却退 0＝假绿（证明退出码真由判据驱动）
#   D 只撤 isfile 那一层 → `mode=ro` 那层单独也拦得住，仍退 1、盘上不许多出库
#   F isfile＋只读口一起撤（换成旧版那句相对路径 connect）⇒ 空库真被建出来（＝旧坑落回盘上），
#     但缺表那闸仍退 1；这一档专门证明 isfile 那一层拦的是"残留"，不是"删错"
#   E A＋B＋C 全撤 → 真人账号当场没了、屏上「2 红｜已提交」、退出码 0＝有红照样提交
#     ⚠ E 不是旧版字节的复现（旧版没有判据层，屏上连「红」这个字都没有）；旧版"崩在半路留半截"那一型
#       要多撤 except 那层（多行锚点，本尺子没做），读数只能靠一次性旧字节探针，记在正本 §29。
#
# ⚠ 这把尺子**默认不跑整份改前字节**（HEAD 那版 54 行）：旧版没有判据层，`mutate` 那批锚点全不在它字节里。
#   但旧版的**行为**可以外部量 ⇒ 给了环境变量 `Z61_OLD=<改前字节路径>` 才多跑一组「12. 旧字节对照」，
#   同一批夹具、只看盘上结果与退出码，不看屏上判据。取改前字节：
#     git show HEAD:docs/工具/清扫-探针游客号.py > /tmp/z61-old.py
#     Z61_OLD=/tmp/z61-old.py python3 docs/工具/验-审计Z61清扫探针号-静态.py
#   ⚠ 这一组**故意不接进默认判据**：一旦把那份字节写进仓或跟着 HEAD 读，HEAD 一移动读数就翻面，尺子不再是尺子。
#   11-16 那一趟对照读数记在正本 §29，其中一条把「旧版崩在半路当场留半截」这句**改口成不成立**
#   （旧版所有删除挤在同一趟未提交的隐式事务里，进程一死 SQLite 就丢掉了；这条兜底不属于脚本自己）。
# ⚠ 量不到什么：夹具的表是**按工具用到的列现建的窄表**，不是现网那份完整 schema（列宽、索引、别的外键
#   一概没有）；引用 notes 的其他表没桩；真实现网库里「探针与真人共用 account_id」到底有没有、有几枚，
#   这把尺子一条读数都没有。
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "清扫-探针游客号.py")
MIX = "acc-mix-0000-0000-0000000000000001"
PRL = "acc-probeonly-0000-0000-00000000000002"
ORP = "acc-orphan-0000-0000-0000000000000003"
PROBE = "guest:probe%"
CHILD = ("note_cards", "assets", "categories", "user_profiles", "daily_usage")
fails = []


def ck(name, ok, got=""):
    print(("  ✓ " if ok else "  ✗ ") + name + (f"　→ {got}" if got else ""))
    if not ok:
        fails.append(name)


SCHEMA = """
create table accounts (id text primary key, generation integer not null default 1);
create table users (id integer primary key, openid text unique, account_id text);
create table account_identities (id integer primary key,
    account_id text not null references accounts(id), provider text, provider_uid text);
create table notes (id integer primary key, user_id integer);
create table jobs (id integer primary key, note_id integer references notes(id));
create table shares (id integer primary key, note_id integer references notes(id));
create table note_cards (id integer primary key, user_id integer);
create table assets (id integer primary key, user_id integer);
create table categories (id integer primary key, user_id integer);
create table user_profiles (id integer primary key, user_id integer);
create table daily_usage (id integer primary key, user_id integer);
"""
# 活下来的人：1 是与探针共用账号的真人，5 另一枚真人，6 uuid 型游客（openid 为 NULL，绝不该动）
KEEP_ROWS = """
insert into accounts values ('{MIX}',1),('{PRL}',1),('{ORP}',1);
insert into users values (1,'wx-real-9527','{MIX}'),(5,'wx-other-1',null),(6,null,null);
insert into notes values (101,1),(104,6);
insert into shares values (2,101);
insert into categories values (2,1);
insert into daily_usage values (2,1);
insert into account_identities values (1,'{MIX}','wechat','real-openid'),(2,'{MIX}','email','real@mail');
"""
# 该清掉的人：2/3/4 三枚 guest:probe%；2 与真人共用账号，3 独占一枚账号，4 没有账号
PROBE_ROWS = """
insert into users values (2,'guest:probe-aaa','{MIX}'),(3,'guest:probe-bbb','{PRL}'),(4,'guest:probe-ccc',null);
insert into notes values (102,2),(103,3);
insert into shares values (1,102);
insert into jobs values (1,103);
insert into note_cards values (1,2);
insert into assets values (1,3);
insert into categories values (1,4);
insert into user_profiles values (1,2);
insert into daily_usage values (1,3);
insert into account_identities values (3,'{PRL}','wechat','probe-openid');
"""


def build(path, shape):
    c = sqlite3.connect(path)
    if shape == "缺表":
        c.execute("create table accounts (id text primary key)")
        c.commit()
        c.close()
        return
    c.executescript(SCHEMA)
    c.executescript(KEEP_ROWS.format(MIX=MIX, PRL=PRL, ORP=ORP))
    if shape in ("混账", "崩半路"):
        c.executescript(PROBE_ROWS.format(MIX=MIX, PRL=PRL, ORP=ORP))
    if shape == "崩半路":
        c.execute("create trigger z61_boom after delete on notes begin select no_such_fn(); end")
    c.commit()
    c.close()


def peek(d):
    """只读打开夹具库数一遍；这条口自己也不许把库建出来。"""
    p = os.path.join(d, "wtsj.db")
    st = {"库在": os.path.exists(p), "目录": sorted(os.listdir(d))}
    if not st["库在"]:
        return st
    c = sqlite3.connect(pathlib.Path(p).as_uri() + "?mode=ro", uri=True)
    tabs = sorted(r[0] for r in c.execute("select name from sqlite_master where type='table'"))
    st["表"] = tabs
    if "users" not in tabs:
        c.close()
        return st

    def q(sql):
        return list(c.execute(sql))

    st["users"] = [r[0] for r in q("select id from users order by id")]
    st["probe剩下"] = q("select count(1) from users where openid like '%s'" % PROBE)[0][0]
    st["accounts"] = [r[0] for r in q("select id from accounts order by id")]
    st["真人身份行"] = q("select count(1) from account_identities where account_id='%s'" % MIX)[0][0]
    st["notes"] = [r[0] for r in q("select id from notes order by id")]
    st["shares"] = [r[0] for r in q("select id from shares order by id")]
    st["jobs"] = q("select count(1) from jobs")[0][0]
    st["子行合计"] = sum(q("select count(1) from %s" % t)[0][0] for t in CHILD)
    st["users指空账号"] = q("select count(1) from users where account_id is not null "
                            "and account_id not in (select id from accounts)")[0][0]
    st["孤儿账号"] = q("select count(1) from accounts where id not in "
                       "(select account_id from users where account_id is not null)")[0][0]
    c.close()
    return st


def run(src, shape):
    d = tempfile.mkdtemp(prefix="z61-")
    try:
        with open(os.path.join(d, "tool.py"), "w", encoding="utf-8") as f:
            f.write(src)
        if shape != "没库":
            build(os.path.join(d, "wtsj.db"), shape)
        before = peek(d)
        p = subprocess.run([sys.executable, os.path.join(d, "tool.py")],
                           cwd=d, capture_output=True, text=True)
        return p.returncode, p.stdout + p.stderr, before, peek(d)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def mutate(base, label, old, new):
    ck(f"变体「{label}」的锚点在字节里", old in base, "")
    return base.replace(old, new, 1)


# 旧版只读那一口用的是**相对路径 + 默认可写**的 connect，改成这一串就当场把坑落回盘上
RO_OLD = '''try:
    ro = sqlite3.connect(pathlib.Path(DB).as_uri() + "?mode=ro", uri=True)
'''

with open(TOOL, encoding="utf-8") as f:
    SRC = f.read()

print("\n== 0. 夹具自证：底数就得是 Z61 说的那个形状 ==")
d = tempfile.mkdtemp(prefix="z61-")
try:
    build(os.path.join(d, "wtsj.db"), "混账")
    b = peek(d)
    ck("三枚 guest:probe% 在库里", b["probe剩下"] == 3, f"{b['probe剩下']}")
    ck("六行 users 就位（含共用账号那一对）", b["users"] == [1, 2, 3, 4, 5, 6], f"{b['users']}")
    ck("uuid 型游客在场、且不在 guest:probe% 那三枚里",
       6 in b["users"] and b["probe剩下"] == 3, "")
    ck("库里本来就有 1 枚孤儿账号（所以判据按增量不按绝对值）", b["孤儿账号"] == 1, f"{b['孤儿账号']}")
    ck("真人账号名下 2 条身份行（wechat＋email）", b["真人身份行"] == 2, f"{b['真人身份行']}")
    ck("真人自己也有子行与分享码（少删与多删都才有区分度）",
       b["shares"] == [1, 2] and b["子行合计"] == 7, f"shares{b['shares']} 子行{b['子行合计']}")
    ck("没有 users 行本来就指向不存在的账号（增量判据的起点）", b["users指空账号"] == 0, "")
finally:
    shutil.rmtree(d, ignore_errors=True)

print("\n== 1. 正常一趟：混着真人的那枚账号整枚跳过，探针清干净 ==")
rc, out, before, st = run(SRC, "混账")
ck("混账库：退 0", rc == 0, f"rc={rc}")
ck("混账库：屏上念出「整枚跳过」那句", "整枚跳过" in out, "")
ck("混账库：三枚 probe 全清", st["probe剩下"] == 0, f"{st['probe剩下']}")
ck("混账库：真人 1／另一枚真人 5／uuid 游客 6 三行都还在", st["users"] == [1, 5, 6], f"{st['users']}")
ck("混账库：真人的账号行没被碰", MIX in st["accounts"], f"{st['accounts']}")
ck("混账库：真人的两条身份行一条没少", st["真人身份行"] == 2, f"{st['真人身份行']}")
ck("混账库：纯探针账号已撤", PRL not in st["accounts"], f"{st['accounts']}")
ck("混账库：剩下的账号只有真人那枚＋库里本来就有的孤儿",
   st["accounts"] == [MIX, ORP], f"{st['accounts']}")
ck("混账库：探针的笔记没了、真人与 uuid 游客的笔记还在", st["notes"] == [101, 104], f"{st['notes']}")
ck("混账库：真人那篇的分享码没被牵连（只按探针笔记号删）", st["shares"] == [2], f"{st['shares']}")
ck("混账库：探针子行清空、真人那 2 行子行还在", st["子行合计"] == 2, f"{st['子行合计']}")
ck("混账库：没有 users 行指向已不存在的账号", st["users指空账号"] == 0, f"{st['users指空账号']}")
ck("混账库：孤儿账号数没增加", st["孤儿账号"] == before["孤儿账号"], f"{before['孤儿账号']}→{st['孤儿账号']}")
ck("混账库：屏上念「0 红｜已提交」", "结果：0 红｜已提交" in out, "")

print("\n== 2. 没探针：念一句就退，一行都不许碰 ==")
rc, out, before, st = run(SRC, "没探针")
ck("没探针：退 0", rc == 0, f"rc={rc}")
ck("没探针：屏上念「没什么可清」", "没什么可清" in out, "")
ck("没探针：库里逐字段与跑前一致", st == before, f"{st}")

print("\n== 3. 没库（cwd 跑错那一档）：拦住，而且不许顺手新建一只空库 ==")
rc, out, before, st = run(SRC, "没库")
ck("没库：退 1", rc == 1, f"rc={rc}")
ck("没库：屏上说清是「盘上没有这只库」", "盘上没有" in out, "")
ck("没库：跑完目录里仍然没有 wtsj.db（旧版 connect('wtsj.db') 就是在这儿建出一只空库）",
   st["库在"] is False, f"{st['目录']}")

print("\n== 4. 缺表：吃的不是现网那只库 ⇒ 退出，不许建表也不留残留 ==")
rc, out, before, st = run(SRC, "缺表")
ck("缺表：退 1", rc == 1, f"rc={rc}")
ck("缺表：屏上说「这只库不像现网那只」", "不像现网那只" in out, "")
ck("缺表：库里表没被工具加出来", st["表"] == ["accounts"], f"{st['表']}")
ck("缺表：没留下 -journal／-wal／-shm 残留",
   not [x for x in st["目录"] if x.endswith(("-journal", "-wal", "-shm"))], f"{st['目录']}")

print("\n== 5. 崩在删除中途：整批退回，库里一行没少 ==")
rc, out, before, st = run(SRC, "崩半路")
ck("崩半路：退 1", rc == 1, f"rc={rc}")
ck("崩半路：屏上念「已 rollback」", "已 rollback" in out, "")
ck("崩半路：屏上不念「已提交」", "已提交" not in out, "")
ck("崩半路：三枚 probe 一行没少（前五张子表已删也被回滚带走）",
   st["probe剩下"] == 3 and st["users"] == before["users"], f"{st['users']}")
ck("崩半路：notes／shares／jobs／子行合计全部回到跑前",
   st["notes"] == before["notes"] and st["shares"] == before["shares"]
   and st["jobs"] == before["jobs"] and st["子行合计"] == before["子行合计"],
   f"notes{st['notes']} shares{st['shares']} jobs{st['jobs']} 子行{st['子行合计']}")
ck("崩半路：真人的账号与身份行没被牵连",
   st["真人身份行"] == 2 and MIX in st["accounts"], "")

print("\n== 6. 变体 A：把归属闸撤成「名下账号全撤」⇒ 不变量该自己红，并把整批救回来 ==")
sA = mutate(SRC, "A 撤归属闸", "drop = [a for a in acc if own.get(a, 0) == 0]", "drop = acc")
rc, out, before, st = run(sA, "混账")
ck("A：混账库那一趟退 1（红驱动退出码）", rc == 1, f"rc={rc}")
ck("A：屏上红名正是「没有 users 行指向已经不存在的账号」",
   "✗ 没有 users 行指向已经不存在的账号" in out, "")
ck("A：屏上念「整批 rollback」", "整批 rollback" in out, "")
ck("A：真人的账号与身份行被回滚救回",
   MIX in st["accounts"] and st["真人身份行"] == 2, f"{st['accounts']} {st['真人身份行']}")
ck("A：回滚后三枚 probe 原样还在（＝这一把没删成，宁可什么都不动）",
   st["probe剩下"] == 3, f"{st['probe剩下']}")

print("\n== 7. 变体 B：撤归属闸＋红也不回滚 ⇒ 真人账号真的没了（回滚那句是承重墙） ==")
sB = mutate(sA, "B 红也不回滚", '    if fails:\n        print(f"!! 判据',
            '    if fails and False:\n        print(f"!! 判据')
rc, out, before, st = run(sB, "混账")
ck("B：仍然退 1", rc == 1, f"rc={rc}")
ck("B：屏上不念 rollback、念的是已提交",
   "整批 rollback" not in out and "已提交" in out, "")
ck("B：真人的账号行没了（＝Z61 描述的那个后果落在盘上）", MIX not in st["accounts"], f"{st['accounts']}")
ck("B：真人的两条身份行一起没了", st["真人身份行"] == 0, f"{st['真人身份行']}")
ck("B：真人 users 行还在却已指向不存在的账号 ⇒ 下次登录撞孤儿",
   1 in st["users"] and st["users指空账号"] == 1, f"{st['users']} {st['users指空账号']}")

print("\n== 8. 变体 C：撤归属闸＋退出码写死 ⇒ 有红、已回滚，却退 0＝假绿 ==")
sC = mutate(sA, "C 退出码写死 0", "sys.exit(1 if fails else 0)", "sys.exit(0)")
rc, out, before, st = run(sC, "混账")
ck("C：那一趟退 0（红没转成退出码＝旧版那个洞的另一半）", rc == 0, f"rc={rc}")
ck("C：屏上照样念得出那条红名（红与退出码之间就是靠 sys.exit 那一句连起来的）",
   "✗ 没有 users 行指向已经不存在的账号" in out, "")
ck("C：库里仍被回滚保住（这一档只拆退出码，所以后果只在调用方看不见）",
   st["probe剩下"] == 3 and MIX in st["accounts"], "")

print("\n== 9. 变体 D：只撤 isfile 那一层 ⇒ 只读口那层还该拦得住 ==")
sD = mutate(SRC, "D 撤 isfile 闸", "if not os.path.isfile(DB):", "if False:")
rc, out, before, st = run(sD, "没库")
ck("D：没库那一趟仍退 1", rc == 1, f"rc={rc}")
ck("D：跑完仍没建出 wtsj.db（mode=ro 那层单独也拦得住）", st["库在"] is False, f"{st['目录']}")
ck("D：屏上念的是「只读打开失败」而不是「盘上没有」",
   "只读打开失败" in out and "盘上没有" not in out, "")

print("\n== 10. 变体 F：isfile＋只读那一口一起换回旧版写法 ⇒ 空库真被建出来 ==")
sF = mutate(SRC, "F 只读口换成相对路径 connect", RO_OLD,
            'try:\n    ro = sqlite3.connect("wtsj.db")  # 旧版那一口：相对路径＋默认可写\n')
sF = mutate(sF, "F 撤 isfile 闸", "if not os.path.isfile(DB):", "if False:")
rc, out, before, st = run(sF, "没库")
ck("F：空目录里当场新建出一只 wtsj.db（＝旧版那个坑落在盘上，这一档量的是 isfile 那层的后果）",
   st["库在"] is True, f"{st['目录']}")
ck("F：新建那只库是空表 ⇒ 缺表闸仍退 1、仍念「不像现网那只」", rc == 1 and "不像现网那只" in out,
   f"rc={rc}｜表 {st.get('表')}")
ck("F：退 1 之后盘上那只空库并没被收走（工具只读打开过它，删不删是另一件事）",
   st["库在"] is True, f"{st['目录']}")

print("\n== 11. 变体 E：归属闸＋红不回滚＋退出码三条一起撤＝有红照样提交那副样子 ==")
sE = mutate(sB, "E 退出码写死", "sys.exit(1 if fails else 0)", "sys.exit(0)")
rc, out, before, st = run(sE, "混账")
ck("E：真人账号与身份行没了", MIX not in st["accounts"] and st["真人身份行"] == 0, f"{st['accounts']}")
ck("E：屏上「已提交」前面那枚红数不是 0（有红照样提交＝旧版那副「念着没事、其实删了」的形状）",
   bool(re.search(r"结果：[1-9]\d* 红｜已提交", out)), out.strip().splitlines()[-1])
ck("E：退出码 0＝假绿", rc == 0, f"rc={rc}")
ck("E：真人 users 行还在但指向已不存在的账号 ⇒ 下次登录撞孤儿（这一档的后果留在盘上）",
   1 in st["users"] and st["users指空账号"] == 1, f"{st['users']} {st['users指空账号']}")
print("  · 口径提醒：E 不是旧版字节的复现——旧版压根没有判据层，屏上连「红」这个字都没有；"
      "E 量的是「判据还在但三道出口全被拆掉」那一副形状。旧版自己那三型的读数（混账报绿／空目录建库／"
      "崩在半路）由下面 12 组在 `Z61_OLD` 那一趟现场量，其中「崩在半路留半截」那一句被读数推翻。")

old_path = os.environ.get("Z61_OLD", "")
if old_path:
    print("\n== 12. 旧字节对照（`Z61_OLD` 给了才跑；只看盘上结果与退出码，不看屏上判据）==")
    with open(old_path, encoding="utf-8") as f:
        OLD = f.read()
    ck("旧字节是仓里那份 54 行的形状（有删除、没有 ck/fails 那层）",
       "delete from accounts" in OLD and "fails" not in OLD and "PRAGMA foreign_keys" in OLD, "")
    rc, out, before, st = run(OLD, "混账")
    ck("旧字节×混账：真人的账号行当场没了", MIX not in st["accounts"], f"{st['accounts']}")
    ck("旧字节×混账：真人的两条身份行一起没了", st["真人身份行"] == 0, f"{st['真人身份行']}")
    ck("旧字节×混账：真人 users 行留下并指向已不存在的账号", st["users指空账号"] == 1,
       f"{st['users指空账号']}")
    ck("旧字节×混账：这一切发生在退出码 0 且屏上半句红话没有（＝Z61 判的那条）",
       rc == 0 and "✗" not in out and "rollback" not in out, f"rc={rc}")
    rc, out, before, st = run(OLD, "没库")
    ck("旧字节×没库：空目录里当场被 connect 新建出一只 wtsj.db（＝Z61 判的前半句）",
       st["库在"] is True, f"{st['目录']}")
    ck("旧字节×没库：**退 1**（未捕获的 no such table）⇒ 判词后半句「读空表报 0 绿」这一型不成立",
       rc == 1 and "no such table" in out, f"rc={rc}")
    rc, out, before, st = run(OLD, "没探针")
    ck("旧字节×有表无探针：退 0 并念「没什么可清」⇒ 吃错同名库时它照样报绿（后半句成立的那一面）",
       rc == 0 and "没什么可清" in out, f"rc={rc}")
    rc, out, before, st = run(OLD, "崩半路")
    ck("旧字节×崩半路：probe 三枚与真人身份行**一行没少** ⇒ 「崩了当场留半截」这句改口，"
       "旧版是被 SQLite 未提交的隐式事务兜住的（不是它自己有兜底）",
       st["probe剩下"] == 3 and st["真人身份行"] == 2, f"{st['probe剩下']}／{st['真人身份行']}")
    ck("旧字节×崩半路：只退 1 加一段 traceback，屏上没有一句「已回滚／库里＝动手前」",
       rc == 1 and "Traceback" in out and "rollback" not in out, f"rc={rc}")
else:
    print("\n（12. 旧字节对照组未跑：没给 `Z61_OLD=<改前字节路径>`；11-16 那趟的读数在正本 §29）")

print(f"\n结果：{len(fails)} 红")
for x in fails:
    print("  !", x)
sys.exit(1 if fails else 0)
