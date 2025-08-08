import fs from "fs/promises";
import path from "path";

export type Repo = {
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
};

const CACHE_DIR = path.resolve(".cache");
const DEFAULT_TTL = 60 * 60; // 1 hour in seconds

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    // ignore
  }
}

function cacheFileFor(username: string) {
  return path.join(CACHE_DIR, `${username}-repos.json`);
}

/**
 * Fetch public repos for a user, with token support and file caching.
 *
 * Usage:
 *   import { fetchTopRepos } from '../lib/github';
 *   const repos = await fetchTopRepos('Shrest4647', { count: 6 });
 */
export async function fetchTopRepos(
  username: string,
  opts?: { count?: number; ttlSeconds?: number; per_page?: number }
): Promise<Repo[]> {
  const count = opts?.count ?? 6;
  const ttlSeconds = opts?.ttlSeconds ?? DEFAULT_TTL;
  const per_page = opts?.per_page ?? 100;

  await ensureCacheDir();
  const cacheFile = cacheFileFor(username);

  // Try reading cache
  try {
    const stat = await fs.stat(cacheFile);
    const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
    if (ageSeconds < ttlSeconds) {
      const raw = await fs.readFile(cacheFile, "utf-8");
      const parsed = JSON.parse(raw) as Repo[];
      if (Array.isArray(parsed)) {
        return parsed.slice(0, count);
      }
    }
  } catch (err) {
    // cache miss — continue
  }

  // Prepare fetch
  const token =
    process.env.GITHUB_TOKEN ||
    (typeof (globalThis as any).GITHUB_TOKEN !== "undefined"
      ? (globalThis as any).GITHUB_TOKEN
      : undefined);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "astro-portfolio-fetcher",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/users/${encodeURIComponent(
    username
  )}/repos?per_page=${per_page}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GitHub API error: ${res.status} ${res.statusText} — ${text}`
    );
  }

  const all = await res.json();

  if (!Array.isArray(all)) {
    throw new Error("Unexpected GitHub response");
  }

  const repos: Repo[] = all
    .map((r: any) => ({
      name: r.name,
      html_url: r.html_url,
      description: r.description ?? null,
      language: r.language ?? null,
      stargazers_count: r.stargazers_count ?? 0,
      updated_at: r.updated_at,
    }))
    .sort(
      (a, b) =>
        (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, count);

  // Write cache (best-effort)
  try {
    await fs.writeFile(cacheFile, JSON.stringify(repos, null, 2), "utf-8");
  } catch (err) {
    // ignore write errors
  }

  return repos;
}
