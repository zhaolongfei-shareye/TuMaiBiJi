# 操作单：首屏那行 Tips 改为后台配置（10-15 站长拍「然后Tips 改为后台配置。」）

这一份讲的是**日常怎么用**；实现与判据在 `docs/产品需求.md` §8.253。

## 现在长什么样

- 后台：`https://api.agentsbin.cn/wtsj/ops`（注意路径里那段 `/wtsj/`，直打 `/ops` 是 404）。
  打开输管理口令，往下有**两栏**：上面那栏是首页背景图，下面那栏是「首屏那行 Tips」。
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

## 谁能看到改动

线上那个包 **2.1.10 不读这一栏**——它里面根本没有 `utils/mpAssets.js`（那文件 10-13 11:17 才进仓库，见 `02ef33b`）。
从 **2.2.0 那批起才读**：所以后台从今天起改的每一句，影响的是下一个包之后的真实用户。

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
