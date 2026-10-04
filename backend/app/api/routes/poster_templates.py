"""卡片模板下发接口（方案 docs/方案-卡片模板不走发版.md §四）。

只有一个 GET。写路径不在这里（见 app/services/poster_templates.py 那段说明）：
这张表能改画面，所以它不该出现在任何 externally reachable 的写接口上。

响应里给 `content_hash` 是给客户端当缓存键用的：号没变就不必重新解析一遍配方。
`min_app_version` 由客户端自己筛——"谁的包够新"只有客户端知道，服务器按 query 参数筛
反而会多出第二份会不同步的真相。
"""
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.poster_template import PosterTemplate
from app.services.poster_templates import live_templates

router = APIRouter()


class PosterTemplateResponse(BaseModel):
    template_id: str
    label: str
    label_en: str
    group_key: str
    sort_order: int
    min_app_version: str
    content_hash: str
    recipe: dict

    class Config:
        from_attributes = True


@router.get("/", response_model=List[PosterTemplateResponse])
def list_poster_templates(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    return live_templates(db)
