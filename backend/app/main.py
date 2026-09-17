from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import notes, ingest, auth, categories, shares

app = FastAPI(title="微图闪记 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(shares.router, prefix="/api/shares", tags=["shares"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])

@app.get("/")
async def root():
    return {"message": "微图闪记 API", "version": "0.1.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}
