"""名片与外观档位——从"只在这台手机上"搬到服务器（2.1）。

为什么必须有这张表：站长 10-08 把 2.1 的跨端定义成一句话——**同一个微信号，换手机或重置手机
之后再登录，依旧是自己那批笔记**。笔记、分类、分享、卡片行本来就在服务器上，那一条今天成立；
真正会丢的是这几样只写本机 storage 的东西：

- 名片的名称与一句话（`utils/poster.js` 的 `PROFILE_KEY`）；
- 名片那四格形象图（`AVATAR_FILES_KEY` 记的是 `${USER_DATA_PATH}` 下的本机路径，
  而 `readSlots()` 里那句 `exists(s.path)` 会把"文件不在"的那格**直接静默丢掉**——
  和卡片那一格 2.0.1 之前的毛病一模一样，只是这次没人报）；
- 背景亮度档（`BG_DIM_KEY`）。

**界面字体档（`UI_FONT_KEY`）故意不在这一张表里。** 它不是「没备份」，是**不该同步**：
`app.js` 顶上那段写着，安卓上那三档字体基本命不中，跟着账号跑到别人设备上只会让人看到「没生效」。
换手机后字体回到默认是**这台设备的属性**，不是「你的东西丢了」。

三条口径：

1. **一格图存的是 `cloud://` 地址，不是本机路径。** 本机那份降级成缓存：在就直接用（快、不花钱），
   不在就从云上拉。这条与 `utils/cardCloud.js` 在 S2 起的做法同型，不许倒回去。
2. **壁纸那一档不在这里。** 它的真相已经在 `users.wallpaper`（有现成的读写口），同一个数不许有
   两处真相。这一张表里的 `bg_dim` 是"今天只有本机有"的那一档，不是壁纸。
3. **这四格不进任何配额口。** 现网那 5GB 那一句说的是笔记配图（`routes/assets.py`），卡片是单独
   一项 SUM（`models/note_card.py`）；名片图今天既不计进这两项、也不另起第三项，只把实测字节登记
   下来（`slots[i].size`）。哪天真要并进口子，是一次显式改口径，不是顺手。
"""
from sqlalchemy import Column, DateTime, Integer, JSON, String
from sqlalchemy.sql import func

from app.db.database import Base

# 四格是界面上的事实（`utils/poster.js` 的 SLOT_COUNT），写口按它卡上限。
SLOT_COUNT = 4
# 名称/一句话的长度：库里给的是**服务端上界**，比界面上的 maxlength（16 / 24）宽一档。
# 故意不在这里复刻界面那两条——客户端以后放宽输入框不该把服务端挡死，但也不能没边。
MAX_NAME_LEN = 64
MAX_SLOGAN_LEN = 96
# 亮度档只有三档（palette.BG_DIMS），但服务端不钉死取值：界面上加一档就得跟着发一次后端，
# 而这一档读不到时的兜底是"落回本机默认"，不是报错。所以只卡一个 sane 的整数范围。
BG_DIM_RANGE = (0, 9)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    # 与 Asset/NoteCard.user_id 同型（String(100)，查法一律 `str(user.id)`）。
    # unique：一人一份，写口是 upsert，第二行就是 bug。
    user_id = Column(String(100), nullable=False, unique=True, index=True)
    name = Column(String(MAX_NAME_LEN), nullable=True)
    slogan = Column(String(MAX_SLOGAN_LEN), nullable=True)
    # 四格，顺序就是界面上那四个位置（空位是 null，不是"少一项"——少一项会把后面的格子挪位）。
    # 每格 {file_id, card, bg, width, height, size}。JSON 列，读口不重钉形状（见 routes/profiles.py）。
    slots = Column(JSON, nullable=True)
    bg_dim = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
