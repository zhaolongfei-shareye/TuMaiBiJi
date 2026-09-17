import logging

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.note import Note
from app.services.scraper import scrape_url
from app.services.ocr import ocr_images
from app.services.llm import extract_knowledge

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/url")
async def ingest_url(url: str = Form(...), db: Session = Depends(get_db)):
    try:
        scraped = await scrape_url(url)
    except Exception as e:
        logger.error("抓取失败: %s", e)
        raise HTTPException(status_code=400, detail=f"URL 抓取失败: {e}")

    text = scraped["content"]
    if not text.strip():
        raise HTTPException(status_code=400, detail="未能从 URL 提取到有效内容")

    try:
        knowledge = await extract_knowledge(text, fallback_title=scraped["title"])
    except Exception as e:
        logger.error("LLM 提取失败: %s", e)
        raise HTTPException(status_code=500, detail=f"内容提取失败: {e}")

    note = Note(
        title=knowledge["title"],
        summary=knowledge["summary"],
        key_points=knowledge["key_points"],
        tags=knowledge["tags"],
        original_content=text[:50000],
        source_type=scraped["source_type"],
        source_url=url,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return {"status": "ok", "note_id": note.id, "title": note.title}


@router.post("/screenshot")
async def ingest_screenshot(
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    images_data = []
    for img in images:
        data = await img.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"图片 {img.filename} 超过 10MB 限制")
        images_data.append(data)

    return await _process_ocr_images(images_data, db)


@router.post("/screenshot_single")
async def ingest_screenshot_single(
    images: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    data = await images.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片超过 10MB 限制")

    return await _process_ocr_images([data], db)


async def _process_ocr_images(images_data: list[bytes], db: Session) -> dict:
    try:
        ocr_text = await ocr_images(images_data)
    except Exception as e:
        logger.error("OCR 失败: %s", e)
        raise HTTPException(status_code=500, detail=f"OCR 识别失败: {e}")

    if not ocr_text.strip():
        raise HTTPException(status_code=400, detail="OCR 未识别到文字内容")

    try:
        knowledge = await extract_knowledge(ocr_text)
    except Exception as e:
        logger.error("LLM 提取失败: %s", e)
        raise HTTPException(status_code=500, detail=f"内容提取失败: {e}")

    note = Note(
        title=knowledge["title"],
        summary=knowledge["summary"],
        key_points=knowledge["key_points"],
        tags=knowledge["tags"],
        original_content=ocr_text[:50000],
        source_type="screenshot",
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return {"status": "ok", "note_id": note.id, "title": note.title}
