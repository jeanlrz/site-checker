import { NextRequest } from "next/server";
import { crawlSite } from "@/lib/crawler";
import { runAllChecks } from "@/lib/checks";
import * as cheerio from "cheerio";

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

        // Phase 0: Resolve final URL after redirects (e.g. site.com → www.site.com)
        send({ type: "progress", phase: "Vérification de l'URL...", pagesScanned: 0, totalPages: 0, currentUrl: baseUrl });
        try {
          const checkRes = await fetch(baseUrl, {
            redirect: "follow",
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" },
          });
          if (checkRes.status >= 500) {
            send({ type: "error", message: `Le site répond avec une erreur ${checkRes.status}. Vérifiez l'URL.` });
            return;
          }
          // Use the final URL as baseUrl so www/non-www is consistent throughout
          const finalOrigin = new URL(checkRes.url).origin;
          if (finalOrigin && finalOrigin !== baseUrl) baseUrl = finalOrigin;
        } catch {
          // Network error or timeout: proceed anyway, the crawler will handle it
        }

        send({ type: "progress", phase: "Vérification de l'URL...", pagesScanned: 0, totalPages: 0, currentUrl: baseUrl, resolvedUrl: baseUrl });

        // Phase 1: Check sitemap and robots.txt first
        send({ type: "progress", phase: "Vérification de sitemap.xml et robots.txt...", pagesScanned: 0, totalPages: 0, currentUrl: baseUrl });

        const fetchPage = async (url: string) => {
          try {
            const start = Date.now();
            const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" } });
            const html = await res.text();
            const headers: Record<string, string> = {};
            res.headers.forEach((v, k) => { headers[k] = v; });
            return { url, html, status: res.status, headers, loadTime: Date.now() - start, size: new TextEncoder().encode(html).length };
          } catch {
            return { url, html: "", status: 0, headers: {} as Record<string, string>, loadTime: 0, size: 0 };
          }
        };

        const extraPages = await Promise.all(["/sitemap.xml", "/robots.txt"].map(p => fetchPage(baseUrl + p)));

        // Extract page URLs from a sitemap XML string
        const baseHostname = new URL(baseUrl).hostname.replace(/^www\./, "");
        const skipPatterns = ["/author/", "/category/", "/tag/", "/feed/", "/wp-json/", "/cdn-cgi/", "/elementor-hf/", "/elementskit-content/", "?", "#", "/page/"];
        const paginationRe = /\/\d+\/?$/;
        const extractPageUrls = (xml: string): string[] => {
          const urls: string[] = [];
          const locs = xml.match(/<loc>(.*?)<\/loc>/g) || [];
          for (const match of locs) {
            const u = match.replace(/<\/?loc>/g, "").trim();
            if (!u.startsWith("http")) continue;
            if (u.endsWith(".xml")) continue; // skip sub-sitemap references
            try { if (new URL(u).hostname.replace(/^www\./, "") !== baseHostname) continue; } catch { continue; }
            if (skipPatterns.some(p => u.includes(p))) continue;
            if (paginationRe.test(u)) continue;
            urls.push(u);
          }
          return urls;
        };

        const sitemapUrls: string[] = [];
        const sitemapPage = extraPages.find(p => p.url.includes("sitemap") && p.html);
        if (sitemapPage?.html) {
          if (sitemapPage.html.includes("<sitemapindex")) {
            // Sitemap index: fetch each sub-sitemap (max 5) and extract page URLs
            const subSitemapLocs = (sitemapPage.html.match(/<loc>(.*?)<\/loc>/g) || [])
              .map(m => m.replace(/<\/?loc>/g, "").trim())
              .filter(u => u.endsWith(".xml"))
              .slice(0, 5);
            for (const subUrl of subSitemapLocs) {
              try {
                const res = await fetch(subUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" } });
                const xml = await res.text();
                sitemapUrls.push(...extractPageUrls(xml));
              } catch { /* ignore */ }
            }
          } else {
            sitemapUrls.push(...extractPageUrls(sitemapPage.html));
          }
        }

        // If /sitemap.xml gave nothing, try /sitemap_index.xml directly
        if (sitemapUrls.length === 0) {
          const sitemapIndex = await fetchPage(baseUrl + "/sitemap_index.xml");
          if (sitemapIndex.status === 200 && sitemapIndex.html?.includes("<sitemapindex")) {
            extraPages.push(sitemapIndex); // add to extraPages so the technical check finds it
            const subSitemapLocs = (sitemapIndex.html.match(/<loc>(.*?)<\/loc>/g) || [])
              .map(m => m.replace(/<\/?loc>/g, "").trim())
              .filter(u => u.endsWith(".xml"))
              .slice(0, 5);
            for (const subUrl of subSitemapLocs) {
              try {
                const res = await fetch(subUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" } });
                const xml = await res.text();
                sitemapUrls.push(...extractPageUrls(xml));
              } catch { /* ignore */ }
            }
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

        // Abort if no page was successfully reached (site doesn't exist or is fully unreachable)
        if (pages.filter(p => p.status > 0).length === 0) {
          send({ type: "error", message: "Impossible d'accéder au site. Vérifiez que l'URL est correcte et que le site est en ligne." });
          return;
        }

        const allPages = [...pages, ...extraPages];

        // Phase 3: Run checks
        send({ type: "progress", phase: "Analyse en cours...", pagesScanned: allPages.length, totalPages: allPages.length, currentUrl: "" });

        const categories = await runAllChecks(allPages, baseUrl);

        const duration = Date.now() - startTime;

        // Extraire le logo depuis la page d'accueil
        let siteLogoUrl: string | undefined;
        const homePage = pages.find(p => p.html && (p.url === baseUrl || p.url === baseUrl + "/"));
        if (homePage?.html) {
          const $h = cheerio.load(homePage.html);
          const logoSelectors = [
            "a.custom-logo-link img",
            "img.custom-logo",
            ".elementor-widget-site-logo img",
            ".site-logo img",
            "header img[class*='logo']",
            "header img[id*='logo']",
            "header img[alt*='logo' i]",
            "#logo img",
            ".logo img",
          ];
          for (const sel of logoSelectors) {
            const src = $h(sel).first().attr("src");
            if (src && !src.startsWith("data:")) {
              try { siteLogoUrl = new URL(src, baseUrl).href; } catch { /* ignore */ }
              break;
            }
          }
          // Fallback : apple-touch-icon (toujours le logo de marque)
          if (!siteLogoUrl) {
            const appleIcon = $h('link[rel="apple-touch-icon"]').attr("href");
            if (appleIcon) {
              try { siteLogoUrl = new URL(appleIcon, baseUrl).href; } catch { /* ignore */ }
            }
          }
        }

        send({ type: "done", categories, totalPages: pages.length, duration, resolvedUrl: baseUrl, siteLogoUrl });
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
