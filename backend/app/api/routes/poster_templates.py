"""卡片模板下发接口（方案 docs/方案-卡片模板不走发版.md §四）。

只有一个 GET。写路径不在这里（见 app/services/poster_templates.py 那段说明）。
后台那一栏（`routes/admin_ops.py` 的 `PUT /api/admin/poster/templates/<id>`，站长 10-15 拍
「先补笔记模板管理界面」）能改的是**元数据**：中英文名、排序、最低包版本、上架下架。
`recipe` 不在那四个字段里——这张表能改画面，所以"不发版就能改画"那扇门至今没开，
界面上连一个能输入配方的落点都没有（判据见 tests/test_admin_templates.py 的「配方与分组改不动」）。

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
