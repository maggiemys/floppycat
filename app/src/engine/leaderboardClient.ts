export type LeaderboardPeriod = "daily" | "weekly" | "alltime";

export interface LeaderboardEntry {
  id: number;
  name: string;
  score: number;
  date: string;
}

export interface LeaderboardRanks {
  daily: number;
  weekly: number;
  alltime: number;
}

export interface SubmitResult {
  id: number;
  rank: LeaderboardRanks;
}

export async function fetchScores(
  apiUrl: string,
  period: LeaderboardPeriod
): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${apiUrl}/api/scores?period=${period}`);
  if (!res.ok) throw new Error(`Failed to fetch scores: ${res.status}`);
  const data = await res.json();
  return data.scores;
}

export async function submitScore(
  apiUrl: string,
  name: string,
  score: number
): Promise<SubmitResult> {
  const res = await fetch(`${apiUrl}/api/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, score }),
  });
  if (!res.ok) throw new Error(`Failed to submit score: ${res.status}`);
  return res.json();
}
