from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
from app.db.database import get_db
from app.models.note import Note

router = APIRouter()

class NoteResponse(BaseModel):
    id: int
    title: str
    summary: str
    key_points: list | None
    tags: list | None
    source_type: str
    source_url: str | None
    created_at: datetime
    
    class Config:
        from_attributes = True

class NoteCreate(BaseModel):
    title: str
    summary: str
    key_points: list | None = None
    tags: list | None = None
    original_content: str | None = None
    source_type: str
    source_url: str | None = None

@router.get("/", response_model=List[NoteResponse])
def list_notes(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    notes = db.query(Note).offset(skip).limit(limit).all()
    return notes

@router.get("/{note_id}", response_model=NoteResponse)
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note

@router.post("/", response_model=NoteResponse)
def create_note(note: NoteCreate, db: Session = Depends(get_db)):
    db_note = Note(**note.model_dump())
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note

@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}
