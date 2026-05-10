import * as cheerio from "cheerio";
import type { PageData } from "./types";

export async function crawlSite(
  baseUrl: string,
  onProgress: (url: string, scanned: number, total: number) => void,
  maxPages = 100,
  sitemapUrls: string[] = []
): Promise<PageData[]> {
  const base = new URL(baseUrl);
  const baseHostname = base.hostname.replace(/^www\./, "");
  const visited = new Set<string>();
  const toVisit: string[] = [normalizeUrl(base.href)];

  // Seed from sitemap URLs
  for (const u of sitemapUrls) {
    try {
      const resolved = new URL(u);
      if (resolved.hostname.replace(/^www\./, "") === baseHostname) {
        const normalized = normalizeUrl(resolved.href);
        if (!toVisit.some(t => visitKey(t) === visitKey(normalized))) toVisit.push(normalized);
      }
    } catch { /* ignore */ }
  }
  const pages: PageData[] = [];

  while (toVisit.length > 0 && pages.length < maxPages) {
    const url = toVisit.shift()!;
    const visitedKey = visitKey(url);
    if (visited.has(visitedKey)) continue;
    visited.add(visitedKey);

    try {
      const start = Date.now();
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" },
      });

      const html = await res.text();
      const loadTime = Date.now() - start;
      const size = new TextEncoder().encode(html).length;

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });

      pages.push({ url, html, status: res.status, headers, loadTime, size });

      onProgress(url, pages.length, pages.length + toVisit.length);

      if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
        const $ = cheerio.load(html);
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          try {
            const resolved = new URL(href, url);
            if (resolved.hostname.replace(/^www\./, "") !== baseHostname) return;
            if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
            if (resolved.pathname.includes("/elementor-hf/")) return;
            const normalized = normalizeUrl(resolved.href);
            if (!visited.has(visitKey(normalized)) && !toVisit.some(t => visitKey(t) === visitKey(normalized))) {
              toVisit.push(normalized);
            }
          } catch {
            // invalid URL
          }
        });
      }
    } catch {
      pages.push({
        url,
        html: "",
        status: 0,
        headers: {},
        loadTime: 0,
        size: 0,
      });
      onProgress(url, pages.length, pages.length + toVisit.length);
    }
  }

  return pages;
}

function visitKey(url: string): string {
  try {
    const u = new URL(url);
    u.protocol = "https:";
    u.hostname = u.hostname.replace(/^www\./, "");
    u.hash = "";
    u.search = "";
    let path = u.pathname;
    if (path.endsWith("/") && path !== "/") path = path.slice(0, -1);
    u.pathname = path;
    return u.href;
  } catch { return url; }
}

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  let path = u.pathname;
  if (path.endsWith("/") && path !== "/") {
    path = path.slice(0, -1);
  }
  u.pathname = path;
  return u.href;
}
