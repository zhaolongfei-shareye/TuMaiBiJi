from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.user import User

router = APIRouter()

WALLPAPER_PRESETS = [
    "default",
    "gradient-blue",
    "gradient-green",
    "gradient-sunset",
    "gradient-purple",
    "gradient-ocean",
]

LANGUAGE_OPTIONS = ["zh", "en"]


class WallpaperRequest(BaseModel):
    wallpaper: str


class LanguageRequest(BaseModel):
    language: str


@router.put("/wallpaper")
async def update_wallpaper(
    req: WallpaperRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.wallpaper not in WALLPAPER_PRESETS:
        raise HTTPException(status_code=400, detail=f"Invalid wallpaper. Options: {WALLPAPER_PRESETS}")
    user.wallpaper = req.wallpaper
    db.commit()
    return {"wallpaper": user.wallpaper}


@router.get("/wallpaper/options")
async def get_wallpaper_options():
    return {"options": WALLPAPER_PRESETS}


@router.put("/language")
async def update_language(
    req: LanguageRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.language not in LANGUAGE_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid language. Options: {LANGUAGE_OPTIONS}")
    user.language = req.language
    db.commit()
    return {"language": user.language}
