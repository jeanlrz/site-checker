import { NextRequest } from "next/server";
import { crawlSite } from "@/lib/crawler";
import { runAllChecks } from "@/lib/checks";

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return Response.json({ error: "URL manquante" }, { status: 400 });
  }

  let baseUrl: string;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    baseUrl = parsed.origin;
  } catch {
    return Response.json({ error: "URL invalide" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const startTime = Date.now();

        // Phase 0: Check site is reachable
        send({ type: "progress", phase: "Vérification de l'URL...", pagesScanned: 0, totalPages: 0, currentUrl: baseUrl });
        try {
          const checkRes = await fetch(baseUrl, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" },
          });
          if (checkRes.status >= 500) {
            send({ type: "error", message: `Le site répond avec une erreur ${checkRes.status}. Vérifiez l'URL.` });
            return;
          }
        } catch {
          send({ type: "error", message: "Impossible d'accéder au site. Vérifiez que l'URL est correcte et que le site est en ligne." });
          return;
        }

        // Phase 1: Check sitemap and robots.txt first
        send({ type: "progress", phase: "Vérification de sitemap.xml et robots.txt...", pagesScanned: 0, totalPages: 0, currentUrl: baseUrl });

        const extraPages: { url: string; html: string; status: number; headers: Record<string, string>; loadTime: number; size: number }[] = [];
        for (const path of ["/sitemap.xml", "/robots.txt"]) {
          try {
            const start = Date.now();
            const res = await fetch(baseUrl + path, {
              signal: AbortSignal.timeout(10000),
              headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" },
            });
            const html = await res.text();
            const headers: Record<string, string> = {};
            res.headers.forEach((v, k) => { headers[k] = v; });
            extraPages.push({
              url: baseUrl + path,
              html,
              status: res.status,
              headers,
              loadTime: Date.now() - start,
              size: new TextEncoder().encode(html).length,
            });
          } catch {
            extraPages.push({ url: baseUrl + path, html: "", status: 0, headers: {}, loadTime: 0, size: 0 });
          }
        }

        // Extract URLs from sitemap.xml
        const baseHostname = new URL(baseUrl).hostname.replace(/^www\./, "");
        const sitemapUrls: string[] = [];
        const sitemapPage = extraPages.find(p => p.url.includes("sitemap"));
        if (sitemapPage?.html) {
          const locMatches = sitemapPage.html.match(/<loc>(.*?)<\/loc>/g) || [];
          const skipPatterns = ["/author/", "/category/", "/tag/", "/feed/", "/wp-json/", "/cdn-cgi/", "?", "#", "/page/"];
          const paginationRe = /\/\d+\/?$/;
          for (const match of locMatches) {
            const u = match.replace(/<\/?loc>/g, "").trim();
            if (!u.startsWith("http")) continue;
            try {
              if (new URL(u).hostname.replace(/^www\./, "") !== baseHostname) continue;
            } catch { continue; }
            if (skipPatterns.some(p => u.includes(p))) continue;
            if (paginationRe.test(u)) continue;
            sitemapUrls.push(u);
          }
        }

        // Phase 2: Crawl all pages
        send({ type: "progress", phase: "Exploration des pages du site...", pagesScanned: 0, totalPages: Math.max(1, sitemapUrls.length), currentUrl: baseUrl });

        const pages = await crawlSite(baseUrl, (currentUrl, scanned, total) => {
          send({
            type: "progress",
            phase: "Exploration des pages...",
            pagesScanned: scanned,
            totalPages: total,
            currentUrl,
          });
        }, 100, sitemapUrls);

        const allPages = [...pages, ...extraPages];

        // Phase 3: Run checks
        send({ type: "progress", phase: "Analyse en cours...", pagesScanned: allPages.length, totalPages: allPages.length, currentUrl: "" });

        const categories = await runAllChecks(allPages, baseUrl);

        const duration = Date.now() - startTime;

        send({ type: "done", categories, totalPages: pages.length, duration });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Erreur inconnue" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
