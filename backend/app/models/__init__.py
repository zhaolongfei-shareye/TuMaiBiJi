from app.models.note import Note
from app.models.user import User
from app.models.category import Category
from app.models.asset import Asset
from app.models.job import Job
from app.models.share import Share
from app.models.invitation import Invitation
from app.models.poster_template import PosterTemplate
from app.models.note_card import NoteCard
from app.models.share_report import ShareReport
from app.models.account import Account, AccountIdentity
from app.models.link_code import LinkCode
# `user_profile` 原来只挂在 `alembic/env.py` 上、没进这张名单。后果不是 alembic 认不出表
# （那条有 §8.161 的尺子钉着），而是**任何按 Base.metadata 建表的调用都建不出这一张**：
# `create_all` 与 `drop_all` 看的都是 metadata，而 10-09 那条注销用例就是这么红在
# `no such table: user_profiles` 上的——routes/user.py 里那句 import 是函数内的懒加载，
# 排在建表之后，救不了建表这一步。名单要只有一个地方能把它挂进来。
from app.models.user_profile import UserProfile
# 同一件事在 `generation_seq` 上再防一遍：这张表没人 import 它就建不出来，而它建不出来的症状
# 是"登录 500"（`services/generation._row` 第一句就查它），不是"少一列静默降级"。
from app.models.generation_seq import GenerationSeq

__all__ = ["Note", "User", "Category", "Asset", "Job", "Share", "Invitation", "PosterTemplate", "NoteCard", "ShareReport", "Account", "AccountIdentity", "LinkCode", "UserProfile", "GenerationSeq"]

