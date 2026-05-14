from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ChannelStats(BaseModel):
    name: str
    matinales_count: int
    total_views: int
    avg_views: int
    total_likes: int


class StatsResponse(BaseModel):
    channels: list[ChannelStats]
    total_matinales: int
    total_views: int
    period_days: int


class Matinale(BaseModel):
    id: int
    channel: str
    title: Optional[str]
    published_at: datetime
    duration_seconds: Optional[int]
    debut: Optional[str]      # HH:MM
    fin: Optional[str]        # HH:MM
    duree: Optional[str]      # ex: 2h30m
    view_count: Optional[int]
    like_count: Optional[int]
    youtube_url: str


class TimelinePoint(BaseModel):
    date: str
    data: dict[str, int]     # {channel_name: view_count}
