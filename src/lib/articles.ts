import "server-only";
import * as fs from "fs";
import * as path from "path";
import type { Article, ArticlesData } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");

export function getArticlesData(): ArticlesData | null {
  try {
    const raw = fs.readFileSync(
      path.join(DATA_DIR, "articles.json"),
      "utf-8",
    );
    return JSON.parse(raw) as ArticlesData;
  } catch {
    return null;
  }
}

export function getArticlesForCase(slug: string): Article[] {
  const data = getArticlesData();
  if (!data) return [];
  return data.articles.filter((a) => a.relatedCaseSlugs.includes(slug));
}
