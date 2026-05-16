const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ChannelStats {
  name: string;
  matinales_count: number;
  total_views: number;
  avg_views: number;
  total_likes: number;
}

export interface StatsResponse {
  channels: ChannelStats[];
  total_matinales: number;
  total_views: number;
  period_days: number;
}

export interface Matinale {
  id: number;
  channel: string;
  title: string | null;
  published_at: string;
  duration_seconds: number | null;
  debut: string | null;
  fin: string | null;
  duree: string | null;
  view_count: number | null;
  like_count: number | null;
  youtube_url: string;
}

export async function fetchStats(days: number): Promise<StatsResponse> {
  const res = await fetch(`${API_URL}/api/stats?days=${days}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Erreur API stats");
  return res.json();
}

export async function fetchMatinales(days: number, channel?: string): Promise<Matinale[]> {
  const params = new URLSearchParams({ days: String(days) });
  if (channel) params.set("channel", channel);
  const res = await fetch(`${API_URL}/api/matinales?${params}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Erreur API matinales");
  return res.json();
}

export async function fetchTimeline(days: number): Promise<Record<string, number | string>[]> {
  const res = await fetch(`${API_URL}/api/timeline?days=${days}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Erreur API timeline");
  return res.json();
}

export async function fetchChannels(): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`${API_URL}/api/channels`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("Erreur API channels");
  return res.json();
}

export interface ScheduleEntry {
  channel: string;
  avg_start: string;
  avg_end: string;
  avg_start_min: number;
  avg_end_min: number;
  avg_duration: string | null;
  punctuality_min: number;
  episode_count: number;
}

export async function fetchSchedule(days: number): Promise<ScheduleEntry[]> {
  const res = await fetch(`${API_URL}/api/schedule?days=${days}`);
  if (!res.ok) throw new Error("Erreur API schedule");
  return res.json();
}

export interface ViewSnapshot {
  time: string;          // "HH:MM"
  snapshot_at: string;   // ISO 8601
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
}

export interface MatinaleEvolution {
  matinale_id: number;
  channel: string;
  title: string | null;
  youtube_video_id: string;
  published_at: string;
  snapshots: ViewSnapshot[];
}

export async function fetchViewsEvolution(date?: string): Promise<MatinaleEvolution[]> {
  const params = date ? `?date=${date}` : "";
  const res = await fetch(`${API_URL}/api/views/evolution${params}`);
  if (!res.ok) throw new Error("Erreur API views/evolution");
  return res.json();
}
