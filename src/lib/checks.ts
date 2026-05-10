import * as cheerio from "cheerio";
import type { PageData, CategoryResult, CheckResult, CheckItem, Severity } from "./types";

export async function runAllChecks(pages: PageData[], baseUrl: string): Promise<CategoryResult[]> {
  // Deduplicate pages — handles www/non-www duplicates ending up in the same array
  const seenUrls = new Set<string>();
  const deduped = pages.filter(page => {
    try {
      const u = new URL(page.url);
      u.protocol = "https:";
      u.hostname = u.hostname.replace(/^www\./, "");
      u.hash = "";
      u.search = "";
      if (u.pathname.endsWith("/") && u.pathname !== "/") u.pathname = u.pathname.slice(0, -1);
      const key = u.href;
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    } catch { return true; }
  });

  const categories: CategoryResult[] = [];
  categories.push(checkBrokenLinks(deduped, baseUrl));
  categories.push(checkImages(deduped));
  categories.push(checkSeo(deduped));
  categories.push(checkTechnical(deduped, baseUrl));
  categories.push(checkPerformance(deduped));
  categories.push(checkRequiredPages(deduped, baseUrl));

  return categories;
}

function worstSeverity(checks: CheckResult[]): Severity {
  if (checks.some((c) => c.severity === "error")) return "error";
  if (checks.some((c) => c.severity === "warning")) return "warning";
  return "success";
}

function make(id: string, category: string, label: string, items: CheckItem[]): CheckResult {
  const severity: Severity = items.length === 0 ? "success" : items.length <= 3 ? "warning" : "error";
  return { id, category, label, severity, count: items.length, items };
}

// ─── 1. BROKEN LINKS ────────────────────────────────────────────
function checkBrokenLinks(pages: PageData[], baseUrl: string): CategoryResult {
  const base = new URL(baseUrl);
  const pageUrls = new Set(pages.map((p) => p.url));

  const broken: CheckItem[] = [];
  const empty: CheckItem[] = [];

  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);
    const seenThisPage = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().slice(0, 80);

      if (!href || href === "#" || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        if (href === "#" && $(el).closest("nav, [role='navigation'], [class*='cmplz'], [id*='cmplz'], [class*='cookie'], [id*='cookie'], .cart-contents, .wc-block-mini-cart, [class*='mini-cart'], .wpml-ls, [class*='wpml-ls'], .pll-parent-menu-item").length === 0) {
          if (text.includes("{") || text.includes("}")) return;
          if (/cart/i.test($(el).attr("class") || "")) return;
          if (!seenThisPage.has(text)) {
            seenThisPage.add(text);
            empty.push({ page: page.url, element: `<a>${text || "(vide)"}</a>`, detail: `Bouton sans lien (href="#")` });
          }
        }
        return;
      }

      // Ignore hrefs with spaces (CMS placeholder text used as href, not real URLs)
      if (href.includes(" ")) return;
      try { if (decodeURIComponent(href).includes(" ")) return; } catch { /* ignore */ }

      // Ignore Cloudflare email-protection links (work client-side via JS, always 404 server-side)
      if (href.includes("/cdn-cgi/")) return;

      try {
        const resolved = new URL(href, page.url);
        if (resolved.hostname === base.hostname) {
          if (resolved.pathname.includes("/cdn-cgi/")) return;
          const norm = normalizeForCheck(resolved.href);
          const matchingPage = pages.find((p) => normalizeForCheck(p.url) === norm);
          if (matchingPage && matchingPage.status >= 400) {
            broken.push({ page: page.url, element: `<a>${text}</a>`, detail: `${href} → ${matchingPage.status}` });
          }
        }
      } catch {
        broken.push({ page: page.url, element: `<a>${text}</a>`, detail: `URL invalide: ${href}` });
      }
    });
  }

  const checks = [
    make("broken-links", "links", "Liens cassés (404)", broken),
    make("empty-links", "links", "Boutons sans lien (href=\"#\")", empty),
  ];

  return { id: "links", label: "Liens", icon: "Link", severity: worstSeverity(checks), checks };
}

// ─── 2. IMAGES ──────────────────────────────────────────────────
function checkImages(pages: PageData[]): CategoryResult {
  const noAlt: CheckItem[] = [];
  const notWebp: CheckItem[] = [];
  const largeImages: CheckItem[] = [];
  const brokenImages: CheckItem[] = [];
  const seenNotWebp = new Set<string>();

  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);

    $("img").each((_, el) => {
      const src = $(el).attr("src") || "";
      const alt = $(el).attr("alt");
      const srcShort = src.split("/").pop() || src;
      let resourceUrl: string | undefined;
      try { if (src && !src.startsWith("data:")) resourceUrl = new URL(src, page.url).href; } catch { /* ignore */ }

      if (alt === undefined || alt.trim() === "") {
        noAlt.push({ page: page.url, element: `<img src="${srcShort}">`, detail: "Texte alternatif manquant", resourceUrl });
      }

      if (!src || src.startsWith("data:")) return;

      const srcClean = src.split("?")[0].toLowerCase();
      if (/\.(jpe?g|png|gif|bmp|tiff?)$/.test(srcClean)) {
        const key = resourceUrl || srcClean;
        if (!seenNotWebp.has(key)) {
          seenNotWebp.add(key);
          notWebp.push({ page: page.url, element: `<img src="${srcShort}">`, detail: "Format non WebP", resourceUrl });
        }
      }
    });
  }

  const checks = [
    make("no-alt", "images", "Images sans texte alternatif", noAlt),
    make("not-webp", "images", "Images non converties en WebP", notWebp),
    make("large-images", "images", "Images trop lourdes (>500 Ko)", largeImages),
    make("broken-images", "images", "Images cassées", brokenImages),
  ];

  return { id: "images", label: "Images", icon: "Image", severity: worstSeverity(checks), checks };
}

function isHtmlPage(page: PageData): boolean {
  const url = page.url;
  if (url.endsWith(".xml") || url.endsWith(".txt") || url.endsWith(".json")) return false;
  if (url.includes("/cdn-cgi/") || url.includes("/wp-json/") || url.includes("/feed/")) return false;
  const ct = page.headers["content-type"] || "";
  if (ct && !ct.includes("text/html")) return false;
  return true;
}

// ─── 3. SEO ─────────────────────────────────────────────────────
function checkSeo(pages: PageData[]): CategoryResult {
  const missingTitle: CheckItem[] = [];
  const missingDesc: CheckItem[] = [];
  const missingH1: CheckItem[] = [];
  const multipleH1: CheckItem[] = [];
  const duplicateTitles: CheckItem[] = [];
  const longTitle: CheckItem[] = [];
  const longDesc: CheckItem[] = [];

  const titles = new Map<string, string[]>();

  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);

    const title = $("title").first().text().trim();
    if (!title) {
      missingTitle.push({ page: page.url, detail: "Balise <title> manquante" });
    } else {
      if (title.length > 60) {
        longTitle.push({ page: page.url, detail: `${title.length} caractères: "${title.slice(0, 70)}…"` });
      }
      // Normalize URL: strip .html (with optional /N pagination) and trailing /N
      const normalizePageUrl = (u: string) => u.replace(/^http:\/\//, "https://").replace(/^(https:\/\/)www\./, "$1").replace(/\.html(\/\d+)?$/, "").replace(/\/\d+$/, "");
      const normalizedUrl = normalizePageUrl(page.url);
      const existing = titles.get(title) || [];
      if (!existing.some((u) => normalizePageUrl(u) === normalizedUrl)) {
        existing.push(page.url);
      }
      titles.set(title, existing);
    }

    const desc = $('meta[name="description"]').attr("content")?.trim();
    if (!desc) {
      missingDesc.push({ page: page.url, detail: "Meta description manquante" });
    } else if (desc.length > 160) {
      longDesc.push({ page: page.url, detail: `${desc.length} caractères` });
    }

    const h1s = $("h1");
    if (h1s.length === 0) {
      missingH1.push({ page: page.url, detail: "Aucun H1 sur la page" });
    } else if (h1s.length > 1) {
      multipleH1.push({ page: page.url, detail: `${h1s.length} H1 trouvés` });
    }
  }

  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      for (const url of urls) {
        duplicateTitles.push({ page: url, detail: `Title dupliqué: "${title.slice(0, 50)}…"` });
      }
    }
  }

  const checks = [
    make("missing-title", "seo", "Pages sans <title>", missingTitle),
    make("missing-desc", "seo", "Pages sans meta description", missingDesc),
    make("missing-h1", "seo", "Pages sans H1", missingH1),
    make("multiple-h1", "seo", "Pages avec plusieurs H1", multipleH1),
    make("duplicate-titles", "seo", "Titles dupliqués", duplicateTitles),
    make("long-title", "seo", "Titles trop longs (>60 car.)", longTitle),
    make("long-desc", "seo", "Meta descriptions trop longues (>160 car.)", longDesc),
  ];

  return { id: "seo", label: "SEO", icon: "Search", severity: worstSeverity(checks), checks };
}

// ─── 4. TECHNIQUE ───────────────────────────────────────────────
function checkTechnical(pages: PageData[], baseUrl: string): CategoryResult {
  const checks: CheckResult[] = [];

  // Favicon
  const homepage = pages.find((p) => p.url === baseUrl || p.url === baseUrl + "/");
  if (homepage?.html) {
    const $ = cheerio.load(homepage.html);
    const hasFavicon = $('link[rel="icon"], link[rel="shortcut icon"]').length > 0;
    checks.push({
      id: "favicon",
      category: "technical",
      label: "Favicon",
      severity: hasFavicon ? "success" : "error",
      count: hasFavicon ? 0 : 1,
      items: hasFavicon ? [] : [{ page: baseUrl, detail: "Aucun favicon détecté" }],
    });
  }

  // Viewport meta
  const noViewport: CheckItem[] = [];
  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);
    if ($('meta[name="viewport"]').length === 0) {
      noViewport.push({ page: page.url, detail: "Meta viewport manquante" });
    }
  }
  checks.push(make("viewport", "technical", "Meta viewport (responsive)", noViewport));

  // HTTPS mixed content
  const mixed: CheckItem[] = [];
  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);
    $("script[src], link[href], img[src], iframe[src]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      if (src.startsWith("http://") && !src.includes("localhost")) {
        mixed.push({ page: page.url, element: el.tagName, detail: `Ressource HTTP: ${src.slice(0, 80)}` });
      }
    });
  }
  checks.push(make("mixed-content", "technical", "Contenu mixte HTTP/HTTPS", mixed));

  // Sitemap — accepts sitemap.xml, sitemap_index.xml, or any sitemap variant
  const sitemapPage = pages.find((p) => p.url.includes("sitemap") && p.status === 200 && p.html);
  checks.push({
    id: "sitemap",
    category: "technical",
    label: "Sitemap.xml",
    severity: sitemapPage ? "success" : "warning",
    count: sitemapPage ? 0 : 1,
    items: sitemapPage ? [] : [{ page: baseUrl + "/sitemap.xml", detail: "Sitemap non trouvé ou inaccessible" }],
  });

  // robots.txt
  const robotsPage = pages.find((p) => p.url.includes("robots.txt"));
  checks.push({
    id: "robots",
    category: "technical",
    label: "Robots.txt",
    severity: robotsPage && robotsPage.status === 200 ? "success" : "warning",
    count: robotsPage && robotsPage.status === 200 ? 0 : 1,
    items: robotsPage && robotsPage.status === 200 ? [] : [{ page: baseUrl + "/robots.txt", detail: "robots.txt non trouvé" }],
  });

  // Lorem ipsum
  const loremIpsum: CheckItem[] = [];
  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const html = page.html.toLowerCase();
    if (html.includes("lorem ipsum")) {
      const count = (html.match(/lorem ipsum/g) || []).length;
      loremIpsum.push({ page: page.url, detail: `${count} occurrence(s) de "Lorem ipsum"` });
    }
  }
  checks.push(make("lorem-ipsum", "technical", "Lorem ipsum détecté", loremIpsum));

  // Google Analytics / Tag Manager
  const homepageGA = pages.find((p) => isHtmlPage(p) && p.html);
  if (homepageGA) {
    const hasGA = homepageGA.html.includes("google-analytics") || homepageGA.html.includes("gtag") || homepageGA.html.includes("googletagmanager") || homepageGA.html.includes("GTM-") || homepageGA.html.includes("UA-") || homepageGA.html.includes("G-");
    checks.push({
      id: "no-analytics",
      category: "technical",
      label: "Google Analytics / GTM",
      severity: hasGA ? "success" : "warning",
      count: hasGA ? 0 : 1,
      items: hasGA ? [] : [{ page: homepageGA.url, detail: "Aucun script Analytics/GTM détecté" }],
    });
  }

  return { id: "technical", label: "Technique", icon: "Settings", severity: worstSeverity(checks), checks };
}

// ─── 5. PERFORMANCE ─────────────────────────────────────────────
function checkPerformance(pages: PageData[]): CategoryResult {
  const heavy: CheckItem[] = [];
  const slow: CheckItem[] = [];

  for (const page of pages) {
    const sizeKb = Math.round(page.size / 1024);
    if (sizeKb > 2000) {
      heavy.push({ page: page.url, detail: `${sizeKb} Ko (HTML seul)` });
    }
    if (page.loadTime > 5000) {
      slow.push({ page: page.url, detail: `${(page.loadTime / 1000).toFixed(1)}s de chargement` });
    }
  }

  const checks = [
    make("heavy-pages", "performance", "Pages lourdes (>2 Mo HTML)", heavy),
    make("slow-pages", "performance", "Pages lentes (>5s)", slow),
  ];

  return { id: "performance", label: "Performance", icon: "Zap", severity: worstSeverity(checks), checks };
}

// ─── 6. SOCIAL / OG ────────────────────────────────────────────
function checkSocial(pages: PageData[]): CategoryResult {
  const missingOg: CheckItem[] = [];

  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);
    const ogTitle = $('meta[property="og:title"]').attr("content");
    const ogDesc = $('meta[property="og:description"]').attr("content");
    const ogImage = $('meta[property="og:image"]').attr("content");

    const missing: string[] = [];
    if (!ogTitle) missing.push("og:title");
    if (!ogDesc) missing.push("og:description");
    if (!ogImage) missing.push("og:image");

    if (missing.length > 0) {
      missingOg.push({ page: page.url, detail: `Manquant: ${missing.join(", ")}` });
    }
  }

  const checks = [make("missing-og", "social", "Balises Open Graph manquantes", missingOg)];

  return { id: "social", label: "Réseaux sociaux", icon: "Share2", severity: worstSeverity(checks), checks };
}

// ─── 7. ACCESSIBILITÉ ──────────────────────────────────────────
function checkAccessibility(pages: PageData[]): CategoryResult {
  const missingFormLabels: CheckItem[] = [];
  const emptyLinks: CheckItem[] = [];
  const missingLang: CheckItem[] = [];

  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);

    const lang = $("html").attr("lang");
    if (!lang) {
      missingLang.push({ page: page.url, detail: "Attribut lang manquant sur <html>" });
    }

    $("input, select, textarea").each((_, el) => {
      const id = $(el).attr("id");
      const ariaLabel = $(el).attr("aria-label");
      const ariaLabelledBy = $(el).attr("aria-labelledby");
      const type = $(el).attr("type");
      if (type === "hidden" || type === "submit" || type === "button") return;

      const hasExplicitLabel = id && $(`label[for="${id}"]`).length > 0;
      const hasImplicitLabel = $(el).closest("label").length > 0;

      if (!ariaLabel && !ariaLabelledBy && !hasExplicitLabel && !hasImplicitLabel) {
        const name = $(el).attr("name") || $(el).attr("type") || el.tagName;
        missingFormLabels.push({ page: page.url, element: `<${el.tagName} name="${name}">`, detail: "Pas de label associé" });
      }
    });

    $("a").each((_, el) => {
      const text = $(el).text().trim();
      const ariaLabel = $(el).attr("aria-label");
      const img = $(el).find("img[alt]");
      if (!text && !ariaLabel && img.length === 0) {
        const href = $(el).attr("href") || "";
        emptyLinks.push({ page: page.url, element: `<a href="${href.slice(0, 50)}">`, detail: "Lien sans texte visible" });
      }
    });
  }

  const checks = [
    make("missing-lang", "a11y", "Attribut lang manquant", missingLang),
    make("form-labels", "a11y", "Champs de formulaire sans label", missingFormLabels),
    make("empty-links-a11y", "a11y", "Liens sans texte", emptyLinks),
  ];

  return { id: "a11y", label: "Accessibilité", icon: "Eye", severity: worstSeverity(checks), checks };
}

// ─── 8. PAGES OBLIGATOIRES ──────────────────────────────────────
function checkRequiredPages(pages: PageData[], baseUrl: string): CategoryResult {
  const requiredPages = [
    {
      id: "mentions-legales",
      label: "Mentions légales",
      slugs: ["mentions-legales", "mentions_legales", "mentions-legal", "legal-notice", "legales"],
      titles: ["mentions légales", "mentions legales"],
    },
    {
      id: "politique-confidentialite",
      label: "Politique de confidentialité",
      slugs: ["politique-de-confidentialite", "politique-confidentialite", "confidentialite", "privacy-policy", "privacy", "rgpd", "donnees-personnelles"],
      titles: ["politique de confidentialité", "confidentialité", "privacy", "rgpd", "données personnelles"],
    },
    {
      id: "politique-cookies",
      label: "Politique de cookies",
      slugs: ["politique-de-cookies", "politique-cookies", "cookies", "cookie-policy", "gestion-des-cookies"],
      titles: ["politique de cookies", "gestion des cookies", "cookie"],
    },
  ];

  const checks: CheckResult[] = [];

  for (const req of requiredPages) {
    const found = pages.find((p) => {
      if (!isHtmlPage(p) || p.status >= 400) return false;
      const urlLower = p.url.toLowerCase();
      if (req.slugs.some((s) => urlLower.includes(s))) return true;
      if (req.id === "plan-du-site") {
        try {
          const path = new URL(p.url).pathname.toLowerCase();
          const hasNav = path.includes("nav");
          const hasPlan = path.includes("plan");
          const hasSite = path.includes("site");
          const hasLink = path.includes("link");
          if (hasNav) return true;
          if ([hasPlan, hasSite, hasLink].filter(Boolean).length >= 2) return true;
        } catch { /* ignore */ }
      }
      if (p.html) {
        const $ = cheerio.load(p.html);
        const title = $("title").first().text().toLowerCase();
        const h1 = $("h1").first().text().toLowerCase();
        return req.titles.some((t) => title.includes(t) || h1.includes(t));
      }
      return false;
    });

    const notFoundSeverity: "error" | "warning" = req.id === "plan-du-site" ? "warning" : "error";

    checks.push({
      id: req.id,
      category: "pages",
      label: req.label,
      severity: found ? "success" : notFoundSeverity,
      count: found ? 0 : 1,
      items: found ? [] : [{
        page: baseUrl,
        detail: req.id === "plan-du-site"
          ? "Page non détectée — vérifier qu'elle est liée depuis le site"
          : `Page "${req.label}" introuvable`,
      }],
    });
  }

  return { id: "pages", label: "Pages", icon: "FileText", severity: worstSeverity(checks), checks };
}

function normalizeForCheck(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  let path = u.pathname;
  if (path.endsWith("/") && path !== "/") path = path.slice(0, -1);
  u.pathname = path;
  return u.href;
}
