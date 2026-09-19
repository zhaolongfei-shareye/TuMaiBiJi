from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, model_validator
from datetime import datetime
from sqlalchemy import or_
from app.db.database import get_db
from app.models.note import Note
from app.models.user import User
from app.core.auth import get_current_user

router = APIRouter()


class NoteBrief(BaseModel):
    id: int
    title: str
    summary: str | None
    tags: list | None
    source_type: str
    source_url: str | None
    category_id: int | None
    is_pinned: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NoteDetail(NoteBrief):
    key_points: list | None
    key_links: list | None
    content: str | None
    original_content: str | None
    updated_at: datetime | None


class NoteCreate(BaseModel):
    title: str
    summary: str | None = None
    key_points: list | None = None
    key_links: list | None = None
    tags: list | None = None
    content: str | None = None
    original_content: str | None = None
    source_type: str = "manual"
    source_url: str | None = None
    category_id: int | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    key_points: list | None = None
    key_links: list | None = None
    tags: list | None = None
    content: str | None = None
    original_content: str | None = None
    source_url: str | None = None
    category_id: int | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_title(cls, values):
        if isinstance(values, dict) and "title" in values and values["title"] is None:
            values.pop("title")  # Remove null title so it won't be updated
        return values


@router.get("/", response_model=List[NoteBrief])
def list_notes(
    skip: int = 0,
    limit: int = Query(20, ge=1, le=100),
    category_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Note).filter(Note.user_id == str(user.id))
    if category_id is not None:
        q = q.filter(Note.category_id == category_id)
    if search:
        escaped = search.replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        q = q.filter(
            or_(
                Note.title.ilike(pattern, escape="\\"),
                Note.summary.ilike(pattern, escape="\\"),
                Note.content.ilike(pattern, escape="\\"),
                Note.original_content.ilike(pattern, escape="\\"),
            )
        )
    notes = (
        q.order_by(Note.is_pinned.desc(), Note.pinned_at.desc().nullslast(), Note.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return notes


@router.get("/{note_id}", response_model=NoteDetail)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.post("/", response_model=NoteDetail)
def create_note(
    note: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.category import Category
    
    # Validate category ownership if provided
    if note.category_id is not None:
        category = (
            db.query(Category)
            .filter(Category.id == note.category_id, Category.user_id == str(user.id))
            .first()
        )
        if not category:
            raise HTTPException(status_code=400, detail="分类不存在或无权使用")
    
    db_note = Note(**note.model_dump(), user_id=str(user.id))
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


@router.put("/{note_id}", response_model=NoteDetail)
def update_note(
    note_id: int,
    note: NoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.category import Category
    
    db_note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = note.model_dump(exclude_unset=True)
    
    # Validate category ownership if provided
    if "category_id" in update_data and update_data["category_id"] is not None:
        category = (
            db.query(Category)
            .filter(Category.id == update_data["category_id"], Category.user_id == str(user.id))
            .first()
        )
        if not category:
            raise HTTPException(status_code=400, detail="分类不存在或无权使用")
    
    for key, value in update_data.items():
        setattr(db_note, key, value)
    db.commit()
    db.refresh(db_note)
    return db_note


@router.post("/{note_id}/pin", response_model=NoteBrief)
def pin_note(
    note_id: int,
    pin: bool = Query(True),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db_note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    from datetime import datetime, timezone
    db_note.is_pinned = pin
    db_note.pinned_at = datetime.now(timezone.utc) if pin else None
    db.commit()
    db.refresh(db_note)
    return db_note


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.share import Share
    from app.models.job import Job
    
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Delete related shares and jobs first to avoid foreign key constraint errors
    db.query(Share).filter(Share.note_id == note_id).delete()
    db.query(Job).filter(Job.note_id == note_id).delete()
    
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}
