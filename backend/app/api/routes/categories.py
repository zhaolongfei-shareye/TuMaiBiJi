from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Annotated, List
from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from app.db.database import get_db
from app.models.category import Category
from app.models.note import Note
from app.models.user import User
from app.core.auth import get_current_user
from app.core.private_access import PRIVATE_CATEGORY_NAME
from app.core.timefmt import UTCDatetime
from app.services import category_names
from app.services.sharing import close_shares

router = APIRouter()


# String(100) 在 SQLite 上不生效，实测百万字的分类名照样存进去；而分类名会出现在
# 首页每一条笔记上，一条就能把列表撑爆。上限跟模型声明的列宽对齐。
MAX_NAME = 100
MAX_COLOR = 20
MAX_REORDER = 200

Name = Annotated[str, Field(min_length=1, max_length=MAX_NAME)]
Color = Annotated[str, Field(max_length=MAX_COLOR)]


class CategoryResponse(BaseModel):
    id: int
    name: str
    # 两档显示值。可空＝那一档没有译名，客户端回落到 `name`（他那句"翻译不了就维持原文"）。
    name_zh: str | None = None
    name_en: str | None = None
    color: str
    sort_order: int
    created_at: UTCDatetime
    # 这一格里有几篇。删格那一下要说清这个数（站长 10-17「删除要二次确认」，
    # 而这条链上唯一不可逆的就是"归好类的关系会丢"），客户端自己数不出来：
    # 它手上只有已经加载的那 50 篇，不是这一格的全部。
    # 默认 `None` 而不是 `0`：新建与改名那两趟的响应里没有这个数，
    # 写 0 就是"这一格里一篇也没有"的一句假话——只有下面那一次 GROUP BY 才配给数。
    note_count: int | None = None

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: Name
    color: Color = "#666666"


class CategoryUpdate(BaseModel):
    name: Name | None = None
    color: Color | None = None

    @model_validator(mode="before")
    @classmethod
    def coerce_null_color(cls, values):
        if isinstance(values, dict) and "color" in values and values["color"] is None:
            values["color"] = "#666666"
        return values


class CategoryReorder(BaseModel):
    ids: Annotated[list[int], Field(max_length=MAX_REORDER)]


@router.get("/", response_model=List[CategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cats = (
        db.query(Category)
        .filter(Category.user_id == str(user.id))
        .order_by(Category.sort_order.asc(), Category.id.asc())
        .all()
    )
    # 一次 GROUP BY 拿齐每格的篇数。不许写成循环里逐格 count——那是一屏 N 趟查询，
    # 分类越多越慢，而这个接口是每次进列表都要打的。
    counts = dict(
        db.query(Note.category_id, func.count(Note.id))
        .filter(Note.user_id == str(user.id), Note.category_id.isnot(None))
        .group_by(Note.category_id)
        .all()
    )
    for c in cats:
        c.note_count = counts.get(c.id, 0)
    return cats


@router.post("/", response_model=CategoryResponse)
def create_category(
    cat: CategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Check for duplicate name
    existing = (
        db.query(Category)
        .filter(Category.user_id == str(user.id), Category.name == cat.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="分类名称已存在")
    max_order = db.query(Category).filter(Category.user_id == str(user.id)).count()
    db_cat = Category(user_id=str(user.id), name=cat.name, color=cat.color, sort_order=max_order)
    # 词表命中就当场填上两档显示值（零出网、零延迟）；没命中留 NULL，
    # 屏上显示他打的那几个字。这一条链不出网，也不会有第二趟来补。
    zh, en = category_names.pair_from_glossary(cat.name)
    db_cat.name_zh = (cat.name if category_names.is_cjk(cat.name) else zh) or None
    db_cat.name_en = (cat.name if category_names.is_latin(cat.name) and not category_names.is_cjk(cat.name) else en) or None
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    cat: CategoryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db_cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == str(user.id))
        .first()
    )
    if not db_cat:
        raise HTTPException(status_code=404, detail="分类不存在或已删除")
    
    update_data = cat.model_dump(exclude_unset=True)
    
    # Check for duplicate name when updating name
    if "name" in update_data and update_data["name"]:
        existing = (
            db.query(Category)
            .filter(
                Category.user_id == str(user.id),
                Category.name == update_data["name"],
                Category.id != category_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="分类名称已存在")

    # 「私密」这一格是服务端判私密的唯一依据（库里没有 is_private 列，按分类名现算），
    # 所以改名就等于改锁：把这一格改成别的名字，格里的笔记当场全体免密可读，而界面上
    # 看不出任何痕迹。站长 10-17 拍的是这一格**除了不能删，也不能改名**（能拖动换位置），
    # 所以这里从"格里还有笔记才挡"抬成无条件挡——原来那一版空格子改得动，
    # 而"先删空再改名"和"直接改名"在后果上一模一样，中间那道空格就是漏口。
    if (
        "name" in update_data
        and update_data["name"]
        and db_cat.name == PRIVATE_CATEGORY_NAME
        and update_data["name"] != PRIVATE_CATEGORY_NAME
    ):
        raise HTTPException(
            status_code=400,
            detail="「私密」这一格是那道锁的把手，名字不许改；要挪位置可以，拖就行",
        )

    was_private = db_cat.name == PRIVATE_CATEGORY_NAME
    renamed = "name" in update_data and update_data["name"] and update_data["name"] != db_cat.name
    for key, value in update_data.items():
        setattr(db_cat, key, value)
    if renamed:
        # 旧名字的两档显示值不属于新名字，先清空再按词表现填；表外那档留 NULL、显示新名字本身。
        # 清空这一步不能省：留着旧译名，英文界面就会把「旅行」那一格显示成上一个名字的 "Trip"。
        zh, en = category_names.pair_from_glossary(db_cat.name)
        db_cat.name_zh = (db_cat.name if category_names.is_cjk(db_cat.name) else zh) or None
        db_cat.name_en = (
            db_cat.name
            if category_names.is_latin(db_cat.name) and not category_names.is_cjk(db_cat.name)
            else en
        ) or None

    # 反向那半：把别的格改名成「私密」，那一格里在跑的分享码必须一起关掉，否则"归入私密"
    # 就有了第二条路——而第二条路不关码。close_shares 不自己 commit，跟着下面那次一起。
    if not was_private and db_cat.name == PRIVATE_CATEGORY_NAME:
        ids = [
            r[0]
            for r in db.query(Note.id).filter(
                Note.category_id == category_id, Note.user_id == str(user.id)
            ).all()
        ]
        for nid in ids:
            close_shares(db, nid)

    db.commit()
    db.refresh(db_cat)
    return db_cat


@router.post("/reorder")
def reorder_categories(
    body: CategoryReorder,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for idx, cat_id in enumerate(body.ids):
        db_cat = (
            db.query(Category)
            .filter(Category.id == cat_id, Category.user_id == str(user.id))
            .first()
        )
        if db_cat:
            db_cat.sort_order = idx
    db.commit()
    return {"status": "ok"}


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db_cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == str(user.id))
        .first()
    )
    if not db_cat:
        raise HTTPException(status_code=404, detail="分类不存在或已删除")
    # 「私密」这一格是那道锁的把手：判据就是分类名（app/core/private_access.py），
    # 而下面那条通用逻辑会把名下笔记的 category_id 置空——对别的分类那叫"取消归类"，
    # 对这一格等于把一批笔记静默解锁，正文立刻不用密码就读得到。
    # 站长 10-17 拍的是这一格**禁止删除**，所以从"名下还有东西才挡"抬成无条件挡：
    # 原来空的一格删得掉，而撤完密码之后那一格正好是空的。撤密码那条口（`user.py` 的
    # `/private-password/reset`）只清 `private_password_hash` 那一列、**不动分类**，
    # 所以"先撤密码再删格子"这条路是通的——那正是静默解锁那条路，不能留。
    if db_cat.name == PRIVATE_CATEGORY_NAME:
        raise HTTPException(
            status_code=400,
            detail="「私密」这一格不许删：它是那道锁的把手，删了它，归在这一格里的说法就没了",
        )
    # Set related notes' category_id to NULL before deleting the category
    db.query(Note).filter(
        Note.category_id == category_id,
        Note.user_id == str(user.id),
    ).update({Note.category_id: None})
    db.delete(db_cat)
    db.commit()
    return {"message": "Category deleted"}
