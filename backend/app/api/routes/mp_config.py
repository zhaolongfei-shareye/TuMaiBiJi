"""小程序读运营图的那两个口：一个问"现在该用哪张"，一个给字节。

分工决定了两个口的规矩完全不同，别把它们看成同一件事的两半：

- `GET /api/mp/config` **要登录**（小程序那把用户 token）。它回的是"这一栏当前生效的是哪一张"，
  属于账号无关的站点配置，但正因为要登录才好按人分桶限流、也才好在不给匿名者枚举"这张站在用哪张图"。
- `GET /api/mp/a/{token}` **不要登录**（`<image>`/`downloadFile` 拿到的就是一个裸 URL，
  带不上 Authorization 头）。所以它必须挂限流，且路径里那一段是随机串不是自增 id（锚点 A2）。

免登录发图 + 限流 + 按文件头判媒体类型这一套写法不是新造的：
`routes/shares.py:263-293` 那个小程序码接口已经这么跑了很久，连"微信回的是 JPEG 而代码里写死
image/png 会声明与实际不符"这条教训都是从那一段抄来的。这里照抄判型，不写死。
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import UserError
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.services import mp_assets

logger = logging.getLogger(__name__)

router = APIRouter()

# 字节按内容寻址存放，所以同一个 token 地址上的内容永远不会变 → 可以放心让客户端与
# 中间缓存挂一年。这一条不是性能优化：客户端那边还要按 content_hash 再缓存一层（锚点 A4），
# 两层各存各的，谁先失效都不会画出"半张新半张旧"。
_IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}


@router.get("/api/mp/config")
@limiter.limit("60/minute")
def mp_config(request: Request, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """冷启那一次读它（方案 §四 P0-b 的挂载点与 `profileCloud.pull()` 同层）。

    每一已知栏目都在返回体里，值要么是那张图要么是 null。冻结／停用／从未登记这三种
    在这里塌成同一个 null 是故意的：对客户端它们都是"用包里那张"，让它们共用一条分支
    才有锚点 A5 那句"全程不抛、不出声"。要区分那三种是后台那一页的事。
    """
    return mp_assets.config_payload(db)


@router.get("/api/mp/a/{token}")
@limiter.limit("60/minute")
def mp_asset_image(token: str, request: Request, db: Session = Depends(get_db)):
    """按 token 发图。查不着、文件被删了，都回 404——不给"这一串存在但不是你的"这种区分，
    它在这里没有归属概念（公开运营图），多说一句话只是多给枚举者一条线索。
    """
    asset = mp_assets.by_token(db, token)
    if asset is None:
        raise HTTPException(status_code=404, detail="这张图不存在")
    try:
        data = mp_assets.read_bytes(asset)
    except UserError as e:
        logger.warning("运营图取字节失败 id=%s: %s", asset.id, e)
        raise HTTPException(status_code=404, detail="这张图不存在")
    # 媒体类型按文件头判，不读库里那一栏：账本写对了但文件被换过（手工覆盖过同一个文件名）时，
    # 按头判至少不会声明与实际不符。
    media_type = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
    return Response(content=data, media_type=media_type, headers=_IMMUTABLE)
