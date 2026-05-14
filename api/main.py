import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routers import stats

app = FastAPI(title="MediaPulse API", version="1.0.0")

# CORS — autoriser le frontend Vercel
origins = [
    "http://localhost:3000",
    os.environ.get("FRONTEND_URL", "https://mediapulse.vercel.app"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(stats.router)


@app.get("/health")
def health():
    return {"status": "ok"}
