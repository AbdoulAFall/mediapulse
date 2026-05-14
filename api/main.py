import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stats

app = FastAPI(title="MediaPulse API", version="1.0.0")

# CORS — autoriser le frontend Vercel + localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(stats.router)


@app.get("/health")
def health():
    return {"status": "ok"}
