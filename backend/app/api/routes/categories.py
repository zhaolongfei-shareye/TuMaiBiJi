from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
from app.db.database import get_db
from app.models.category import Category
from app.models.note import Note
from app.models.user import User
from app.core.auth import get_current_user

router = APIRouter()


class CategoryResponse(BaseModel):
    id: int
    name: str
    color: str
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: str
    color: str = "#666666"


class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = "#666666"


class CategoryReorder(BaseModel):
    ids: list[int]


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
        raise HTTPException(status_code=404, detail="Category not found")
    
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
        raise HTTPException(status_code=404, detail="Category not found")
    # Set related notes' category_id to NULL before deleting the category
    db.query(Note).filter(
        Note.category_id == category_id,
        Note.user_id == str(user.id),
    ).update({Note.category_id: None})
    db.delete(db_cat)
    db.commit()
    return {"message": "Category deleted"}
