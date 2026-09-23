from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Annotated, List
from pydantic import BaseModel, Field, model_validator
from datetime import datetime
from app.db.database import get_db
from app.models.category import Category
from app.models.note import Note
from app.models.user import User
from app.core.auth import get_current_user
from app.core.timefmt import UTCDatetime

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
    color: str
    sort_order: int
    created_at: UTCDatetime

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
    return (
        db.query(Category)
        .filter(Category.user_id == str(user.id))
        .order_by(Category.sort_order.asc(), Category.id.asc())
        .all()
    )


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
    
    for key, value in update_data.items():
        setattr(db_cat, key, value)
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
    # Set related notes' category_id to NULL before deleting the category
    db.query(Note).filter(
        Note.category_id == category_id,
        Note.user_id == str(user.id),
    ).update({Note.category_id: None})
    db.delete(db_cat)
    db.commit()
    return {"message": "Category deleted"}
