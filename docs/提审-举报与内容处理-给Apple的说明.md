# 举报与内容处理：给 Apple 审核的说明（草稿，2026-10-10）

**这份是什么**：Guideline 1.2（用户生成内容必须有举报、内容过滤，并且有实际处理流程）那一段的
说明文字，准备好可以直接粘进 App Review 的回复框。
**这份不是什么**：不是一句"我们都有了"。下面每一条都标了**代码里有没有**，没有的那条就写没有。

**粘贴之前必须做的三件事**（这份文档的每一句"已实现"都是 2026-10-10 在本仓库读代码读出来的，
不是从现网量出来的）：

1. 这一批（保留期、`reporter_bucket` 落空）当时**还没部署到现网**，也没跑过现网探针。
   部署之后先跑 `probes/读-举报台账.py` 拿一次现网读数，再来用这段话。
2. 下面凡是写"多少条、多少天、几个选项"的数字，都要**从当时代码重读一遍**再抄（180 天、
   6 次/小时、500 字、四个选项）——数字漂了而话没改，是审核期最难看的那种错。
3. 「屏蔽该作者」这一条我们**没有实现**（见文末）。如果审核员按 1.2 逐条点名要这一件，
   不要拿这份草稿含糊过去，要正面回答：现在能做到什么、这一件什么时候做。

---

## 一、中文：我们这一侧到底有什么

| 1.2 要求 | 现状 | 出处（代码层） |
| --- | --- | --- |
| 举报入口 | **有**。每张公开页上都有「举报这篇」，四类原因选一项，可另附自由文本 | `backend/app/api/routes/landing.py`（`REPORT_REASONS`、`submit_report`） |
| 内容过滤 | **有**。写入侧对会公开的文本走一遍平台内容安全校验，不过就不落库 | `backend/app/services/wechat.py:218` `enforce_text_safety`，调用点在 `routes/notes.py`、`routes/shares.py`、`routes/ingest.py` |
| 实际处理流程 | **有读取侧**：一条只读探针把这张表读成台账（按举报人去重、按页面状态分档、理由分布、原话引用），到期清理另有脚本 | `backend/app/services/report_ledger.py`、`backend/probes/读-举报台账.py`、`backend/probes/清-过期举报.py` |
| 屏蔽该作者 | **没有**。见文末那条 | — |

另有两件 1.2 没点名、但我们自己定的约束：

- **一条举报不会自动把别人的页面撤下来**。任何人点一次就能让别人的公开内容消失，那是把审核权
  发给全体访客。处置动作留给人工（表里 `hidden` 那一列是留给这个动作的落点，**目前没有任何代码
  读它**，所以它现在只是一个占位，不是一个开关）。
- **匿名表单不收集来访者地址明文**。只存一个按天轮换的加盐哈希，用来回答"这五份举报是不是同一个人
  刷的"。拿不到客户端地址时那一格**留空**，台账对空的口径是"每一条各算一个人"——宁可多数几个人，
  也不把不相干的人撞成同一个人（少报是那种屏幕上看不出来的错）。

## 二、举报表单的卫生措施（审核员可能会试）

- 原因固定四选一（`spam` / `abuse` / `infringement` / `other`）；不在名单里的值归到 `other`，
  不是原样入库，也不是报错。
- 自由文本上限 500 字（表单 `maxlength` 与服务侧截断各一道）。
- 限流 6 次/小时（按来访者 IP）。正常人手滑顶多两次。
- 提交成功只是"收到了"，页面照常可访问；被举报的内容不由这一步改变可见性。
- 表单是中英双语的网页，公开在 `/n/{token}` 这一路。

## 三、「撤回之后那个码就不收举报了」这条为什么是这样（待拍 #185 甲）

公开链接被作者撤回之后，`/n/{token}` 与 `/n/{token}/report` 都回 404。也就是说
**撤回之后新举报收不进来**。这是刻意的，理由三条：

1. **撤回必须真的生效**。如果撤掉的页面还留着一张能提交的表单，等于我们允许一个"内容已经
   不对外、但还能被继续投诉"的状态，而那种状态下作者以为事情已经结束了。
2. **不区分"撤掉的""过期的""从来不存在的"**。能区分就允许任何人拿一串 token 探出
   "哪些内容曾经公开过、后来被撤了"——那本身是对作者的伤害，撤回的意义也被削掉一半。
3. **已经收到的举报不会被撤回带走**。`share_reports` 只挂 token、不建外键，作者撤码、删笔记
   都不会把已经落库的举报记录一起删掉。所以审核上看得见的那一档"已撤回"来自
   **先举报、后撤回**这条时间线，不是"撤了还收得到"。这一点如果审核员问到，就这么答。

## 四、保留期与删除（待拍 #186 乙）

- 举报行保留 **180 天**（`app/services/report_retention.py` 里 `RETENTION_DAYS` 是全仓唯一的出处）。
- 为什么要有期限：`detail` 那一列是举报人写的自由文本，里面可能出现对第三方的指控；
  被举报的那一页早就没了，那段话还留在库里，这种"比内容活得久"的文本必须有明确期限。
- 到期清理是一条**独立的运维脚本**（`probes/清-过期举报.py`），**默认只报告不删除**，
  必须显式带 `--执行` 才会真删；`created_at` 为空的那些行**一律保留**并单独计数
  （"不知道是什么时候写的"不等于"最旧、该删"）。
- 这条脚本不在任何请求路径上，不会被用户触发。

## 五、可以直接粘的英文段落

> **User-generated content handling (Guideline 1.2)**
>
> Notes shared through a public link carry a "Report this note" entry on the share page itself.
> The reporter picks one of four reasons (spam, abuse, infringement, other) and may add free text.
> Text that is about to be published is screened by WeChat's content-safety check before it is
> stored; content that fails the check is not published.
>
> Reports are not acted on automatically. A single report never hides anyone's page — anyone could
> silence anyone else with one tap. Reports land in a queue that we read with an internal, read-only
> tool which groups them by reporter, by reason, and by the current state of the shared page
> (live / revoked / expired / no such code), and shows the most-reported items first. A human acts on
> the item; that is the "actual process" we can demonstrate.
>
> Reports are kept for 180 days and then purged by a maintenance script that is dry-run by default.
> We do not store reporter IP addresses; we store a daily-rotated salted hash used only to tell
> whether several reports came from the same person. If the client address is not available that
> field is left empty rather than filled with a placeholder, so unknown reporters are never silently
> merged into one person.
>
> Once an author revokes a public link, that link — and its report form — returns 404, so no new
> reports can be filed against content that is no longer distributed. Revoking or deleting the
> underlying note does **not** delete the reports already received: they are kept for the record.
>
> **What we do not have yet**: a "block this author" control. Blocking is not implemented in this
> release. Reported content can be taken down by us, and authors can revoke their own links, but a
> user cannot pre-emptively mute a specific author. We are disclosing this rather than describing a
> capability we don't ship.

---

## 六、还欠着的两件（别在回复里替它们说话）

1. **屏蔽该作者**——1.2 那一栏里的第三件，零实现。要不要做、做成什么形态（按作者的公开链接拉黑，
   还是按账号），是产品决定，还没拍。
2. **空 body 的举报现在回 200**——表单什么都没填也能提交成功一行。要改成 400 会动到公开页面
   和两份文案，是一次对外行为变更，同样没拍。

（以上两条在 `docs/产品需求.md` §8.194／待拍 #160 里有完整的取舍记录。）
