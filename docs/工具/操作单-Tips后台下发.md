# 操作单：首屏那行 Tips 改为后台配置（10-15 站长拍「然后Tips 改为后台配置。」）

这一份讲的是**日常怎么用**；实现与判据在 `docs/产品需求.md` §8.253。

## 现在长什么样

- 后台：`https://api.agentsbin.cn/wtsj/ops`（注意路径里那段 `/wtsj/`，直打 `/ops` 是 404）。
  打开输管理口令。**这一页 10-15 起分两屏**：左边一栏分「数据」与「配置」两组，默认落在数据那一屏；
  Tips 那一格在**配置**屏（点左栏「首屏 Tips」直接跳过去）。
- Tips 那一栏是**两个文本框**：中文一份、English 一份，**一行算一句**，界面上按 8 秒一句轮播。
- 规矩（都是有意这么定的，不是没做完）：
  - 一次点「发布」＝**整份替换**。不做合并、不做"只改中文那半"。
  - 不合格**整份退回**并报错：超过 12 句、某一句超过 48 字、某一句是空的、少了一份语言——四种都会被挡。
    挡下来时屏上维持**上一份**，不会出现"少一句且不知道少哪句"。
    （48 这个数是 10-15 站长拍甲定的：原来卡 40，结果比自家那六句英文里最长的 43 字还紧，
    等于他填自己现在的文案都填不进去。再往上抬要先量那一格折行会不会把首屏顶高。）
  - 点「停用」＝那一栏写回空，客户端落回**包里那六句**（`miniprogram/utils/i18n.js` 的 `tips`）。
  - 改完不是立刻变：客户端在**登录成功那一刻**静默拉一次，落到本机缓存，**下一次冷启/再登录**读到的才是新的。
    判它生效没有，看小程序读到的是下发那一份还是包里那六句，别看后台点没点过。

## 现在生效的那一份（10-15 18:2x 站长一句「帮我把Tips重新整理，并且填上去」）

**这一节就是正本**：后台那一栏里现在躺着的是这七句，改任何一句都改这一节，别再在别处抄第二套说法。
包里那六句（`miniprogram/utils/i18n.js` 的 `tips`）只在做兜底用——**停用之后才会读到它**，所以它和这一节不一致是有意的，不是漂移。

| # | 中文（字数） | English（字母数） |
|---|---|---|
| 1 | 截图或链接存进来，自动出要点（14） | Screenshot or link in, points out（33） |
| 2 | 外文内容，直接写成中文摘要（13） | Read foreign text in Chinese（28） |
| 3 | 原文也一起留着，随时切回来看（14） | The original is saved too（25） |
| 4 | 一篇一张卡片，换版式发微信（13） | Turn a note into a share card（29） |
| 5 | 设了密码那一格，锁着不外发（13） | Lock a folder with a password（29） |
| 6 | 整套配色，点一下就换（10） | Reskin the whole app in a tap（29） |
| 7 | 想存多少存多少，不限篇数（12） | Keep as many notes as you like（30） |

**整理时按什么排的**：一句一步，跟着新用户第一次进来的动作走——存进来 → 得到什么 → 原文还在不在 → 怎么发出去 → 私密那一格 → 外观 → 不限量。原来那六句里第 3、4 两句都在讲"卡片分享"这一条链（合成一句），另外缺了**外文出中文**、**原文也留着**、**不限量**这三条实测兑现得起的。

**每条都守住的边界**（写之前对着 `[[wtsj-marketing-claims-boundary]]` 过了一遍）：不写"任何国家／所有语言／全球资讯"，不写"论文一键总结"，不写"找回"，不提语音，也不提"不发版换模板"。第 2 句那句"直接写成中文摘要"走的是**直接写那一档＋界面那枚「原文翻译」开关**，是量过的；第 7 句"不限篇数"是站长自己拍的板。

**放得下放不下**：那一格 `.blk-tips-line` 有 `max-width: 9em`（九个字一行），中文七句最长 14 字＝折两行，格高 192rpx 装得下；英文最长 33 字母＝两到三行，与原来那六句里最长的 43 字母同档。**没有一句会顶出那一格。**

**读数（不是"我填好了"，是接口回的）**：`PUT /api/admin/mp/texts/tips` → 200；`/api/admin/mp/state` 读回 `zh 7／en 7` 与送进去的逐字相同；再从**用户那道口**验一次（服务器上签一枚真 token 打 `/api/mp/config`）→ HTTP 200、`config 键 ['home_bg','tips']`、`tips 7/7`、第一句读回「截图或链接存进来，自动出要点」。用户侧要**下一次冷启**才轮到这一份，正在看的那一句不会当场跳。

**要退回去**：后台那一栏点「停用，回到包里那份」＝写回 null，客户端落回包里那六句。这一栏改前是**停用态**，所以退回是原样，不是"退回成另一份新文案"。

## 谁能看到改动

线上那个包**在读这一栏**（10-15 拿 nginx 日志结的案：`api/mp/config` 417 条里 32 条不是 devtools，真微信 UA、正式版 referrer、10 个来源 IP）。**以前这里写过"2.1.10 不读这一栏"，那句是错的**——包是 `cli upload` 从工作树打的，从 commit 树里"没有这个文件"推不出"包里没这段代码"。

审核期可以先把这一栏**停用**（`.env` 里 `MP_ASSETS_FREEZE=1` 时整条下发一律回 null，客户端一律用包里那份）。

## 三步自证（改完想知道有没有真生效，就跑这个）

```bash
cd /Users/zlfmac/Documents/TuMaiBiJi

# ① 服务端：写一份探针文案进现网，并留在位上（口令由服务器自己吐出来经管道进来，不进命令行）
ssh agentsbin 'sed -n "s/^ADMIN_TOKEN=//p" /home/ubuntu/wtsj-backend/.env' \
  | backend/.venv/bin/python docs/工具/探-现网Tips后台下发.py --keep

# ② 取一份用户口真实回体当基准（token 在服务器上签，密钥不出那台机器）
ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - <<PY
import json, subprocess
from app.db.database import SessionLocal
from app.models.user import User
from app.core.auth import _sign
db = SessionLocal(); u = db.query(User).order_by(User.id.desc()).first()
tok = _sign(str(u.id), u.generation or 1)
out = subprocess.run(["curl","-s","-H","Authorization: Bearer "+tok,
  "https://api.agentsbin.cn/wtsj/api/mp/config"], capture_output=True, text=True).stdout
open("/tmp/live-tips.json","w").write(out); print(json.loads(out)["tips"]["updated_at"])
PY'
scp agentsbin:/tmp/live-tips.json /tmp/

# ③ 客户端真跑：模拟器里读到的必须是现网那一份、且不是包里那六句（中↔EN 两门都量）
MP_ROOT=$PWD docs/工具/跑尺子.sh 9431 验-Tips现网收到-真跑

# ④ 验完收回，别替站长留一份测试文案
ssh agentsbin 'sed -n "s/^ADMIN_TOKEN=//p" /home/ubuntu/wtsj-backend/.env' \
  | backend/.venv/bin/python docs/工具/探-现网Tips后台下发.py --revert
```

跑尺子那一步约 2–3 分钟（它负责重启 IDE）。相关尺子还有：
`验-Tips后台下发.js`（服务端形状与两道 kind 闭集，静态 27 条）、
`验-Tips下发收得进.js`（客户端读法与兜底顺序，静态 12 条）。

## 一条已知的口子（没修，因为没人拍过）

后台这一栏写进去的句子**不过** `验-中英文缺口.js` 那套双语校验（字数、术语、禁词那几条钉的是仓库里的 i18n，
不吃下发值）。也就是说后台填什么，屏上就出什么。要补的话得决定"下发的句子归谁校验"，那是新决策。
