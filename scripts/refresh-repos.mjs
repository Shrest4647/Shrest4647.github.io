#!/usr/bin/env node
/**
 * scripts/refresh-repos.mjs
 *
 * Fetch public repos for a GitHub user and write a cached JSON to .cache/{username}-repos.json
 *
 * Usage (locally or in GitHub Actions):
 *   GITHUB_USERNAME=Shrest4647 GITHUB_TOKEN=ghp_xxx node scripts/refresh-repos.mjs
 *
 * In GitHub Actions you can just provide the repo secret as GITHUB_TOKEN.
 */

import fs from "fs/promises";
import path from "path";

const username = process.env.GITHUB_USERNAME || "Shrest4647";
const token = process.env.GITHUB_TOKEN;
const per_page = 100;
const cacheDir = path.resolve(".cache");
const cacheFile = path.join(cacheDir, `${username}-repos.json`);

async function main() {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch (err) {
    // ignore
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "repo-refresher",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/users/${encodeURIComponent(
    username
  )}/repos?per_page=${per_page}`;

  console.log(`Fetching repos for ${username} from GitHub...`);
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    console.error(`GitHub API error: ${res.status} ${res.statusText}\n${body}`);
    process.exit(2);
  }

  const all = await res.json();

  if (!Array.isArray(all)) {
    console.error("Unexpected GitHub response (not an array).");
    process.exit(3);
  }

  const repos = all
    .map((r) => ({
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
    );

  await fs.writeFile(cacheFile, JSON.stringify(repos, null, 2), "utf-8");
  console.log(
    `Wrote ${repos.length} repos to ${path.relative(process.cwd(), cacheFile)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
