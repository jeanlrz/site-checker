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
  categories.push(checkSeo(deduped, baseUrl));
  categories.push(checkTechnical(deduped, baseUrl));
  categories.push(checkPerformance(deduped));
  categories.push(await checkRequiredPages(deduped, baseUrl));
  categories.push(await checkWordPress(deduped, baseUrl));

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

  const broken: CheckItem[] = [];
  const empty: CheckItem[] = [];
  const noExternalLinks: CheckItem[] = [];

  // Build inbound link map for orphan/weak link detection
  const inboundMap = new Map<string, Set<string>>();
  const htmlPages = pages.filter((p) => p.html && isHtmlPage(p) && p.status < 400);
  for (const page of htmlPages) {
    try {
      const u = new URL(page.url);
      if (u.hostname === base.hostname && u.pathname !== "/") {
        inboundMap.set(normalizeForCheck(page.url), new Set());
      }
    } catch { /* ignore */ }
  }

  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);
    const seenThisPage = new Set<string>();
    let hasExternalLink = false;

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().slice(0, 80);

      if (!href || href === "#" || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        if (href === "#" && $(el).closest("nav, [role='navigation'], [class*='cmplz'], [id*='cmplz'], [class*='cookie'], [id*='cookie'], .cart-contents, .wc-block-mini-cart, [class*='mini-cart'], .wpml-ls, [class*='wpml-ls'], .pll-parent-menu-item").length === 0) {
          if (text.includes("{") || text.includes("}")) return;
          const elClass = $(el).attr("class") || "";
          if (/cart|add_to_cart|wc-|woocommerce/i.test(elClass)) return;
          if (/ajouter au panier|add to cart|au panier/i.test(text)) return;
          if (!seenThisPage.has(text)) {
            seenThisPage.add(text);
            empty.push({ page: page.url, element: `<a>${text || "(vide)"}</a>`, detail: `Bouton sans lien (href="#")` });
          }
        }
        return;
      }

      if (href.includes(" ")) return;
      try { if (decodeURIComponent(href).includes(" ")) return; } catch { /* ignore */ }
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
          // Register inbound link (exclude self-links)
          if (normalizeForCheck(page.url) !== norm && inboundMap.has(norm)) {
            inboundMap.get(norm)!.add(page.url);
          }
        } else {
          hasExternalLink = true;
        }
      } catch {
        broken.push({ page: page.url, element: `<a>${text}</a>`, detail: `URL invalide: ${href}` });
      }
    });

    // Pages with no external links (only inner pages, not homepage)
    try {
      const u = new URL(page.url);
      if (u.pathname !== "/" && !hasExternalLink && isHtmlPage(page) && page.status < 400) {
        noExternalLinks.push({ page: page.url, detail: "Aucun lien externe sur cette page" });
      }
    } catch { /* ignore */ }
  }

  // Orphan pages (0 inbound links)
  const orphanPages: CheckItem[] = [];
  const weakLinkedPages: CheckItem[] = [];
  for (const [url, sources] of inboundMap) {
    if (sources.size === 0) {
      orphanPages.push({ page: url, detail: "Aucune page ne pointe vers cette page" });
    } else if (sources.size === 1) {
      weakLinkedPages.push({ page: url, detail: "Une seule page pointe vers cette page" });
    }
  }

  const checks = [
    make("broken-links", "links", "Liens cassés (404)", broken),
    make("empty-links", "links", "Boutons sans lien (href=\"#\")", empty),
    make("orphan-pages", "links", "Pages orphelines (aucun lien entrant)", orphanPages),
    make("weak-internal-links", "links", "Pages peu liées (1 seul lien entrant)", weakLinkedPages),
    make("no-external-links", "links", "Pages sans lien externe", noExternalLinks),
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
  const seenNoAlt = new Set<string>();

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
        const noAltKey = resourceUrl || srcShort;
        if (!seenNoAlt.has(noAltKey)) {
          seenNoAlt.add(noAltKey);
          noAlt.push({ page: resourceUrl || srcShort, detail: "Texte alternatif manquant" });
        }
      }

      if (!src || src.startsWith("data:")) return;

      const srcClean = src.split("?")[0].toLowerCase();
      if (/\.(jpe?g|png|gif|bmp|tiff?)$/.test(srcClean)) {
        const key = resourceUrl || srcClean;
        if (!seenNotWebp.has(key)) {
          seenNotWebp.add(key);
          notWebp.push({ page: resourceUrl || srcShort, detail: "Format non WebP" });
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
  if (url.includes("/cdn-cgi/") || url.includes("/wp-json/") || url.includes("/feed/") || url.includes("/elementor-hf/")) return false;
  const ct = page.headers["content-type"] || "";
  if (ct && !ct.includes("text/html")) return false;
  return true;
}

// Pages légales/utilitaires qui n'ont pas besoin de meta description SEO
function isLegalOrUtilityPage(url: string, html?: string): boolean {
  const urlLower = url.toLowerCase();

  const slugs = [
    // Mentions légales
    "mentions-legales", "mentions_legales", "mentions-legal", "legal-notice", "legales",
    // Confidentialité
    "politique-de-confidentialite", "politique-confidentialite", "confidentialite",
    "privacy-policy", "privacy", "rgpd", "donnees-personnelles",
    // Cookies
    "politique-de-cookies", "politique-cookies", "cookie-policy", "gestion-des-cookies", "cookies",
    // Plan du site
    "plan-du-site", "plan_du_site", "sitemap-page", "sitemap-html", "plan-site",
    "site-map", "navigation", "/nav/", "plan-liens", "plan-lien",
  ];
  if (slugs.some((s) => urlLower.includes(s))) return true;

  // Détection par titre / H1 (identique à checkRequiredPages)
  if (html) {
    const $ = cheerio.load(html);
    const title = $("title").first().text().toLowerCase();
    const h1 = $("h1").first().text().toLowerCase();
    const titleKeywords = [
      "mentions légales", "mentions legales",
      "politique de confidentialité", "confidentialité",
      "données personnelles",
      "politique de cookies", "gestion des cookies",
      "plan du site",
    ];
    if (titleKeywords.some((k) => title.includes(k) || h1.includes(k))) return true;
  }

  return false;
}

// ─── 3. SEO ─────────────────────────────────────────────────────
function checkSeo(pages: PageData[], baseUrl: string): CategoryResult {
  const missingTitle: CheckItem[] = [];
  const missingDesc: CheckItem[] = [];
  const missingH1: CheckItem[] = [];
  const multipleH1: CheckItem[] = [];
  const duplicateTitles: CheckItem[] = [];
  const longTitle: CheckItem[] = [];
  const longDesc: CheckItem[] = [];
  const headingHierarchy: CheckItem[] = [];
  const missingFeaturedImage: CheckItem[] = [];

  const titles = new Map<string, string[]>();

  for (const page of pages) {
    if (!page.html || !isHtmlPage(page)) continue;
    const $ = cheerio.load(page.html);

    const robotsMeta = ($('meta[name="robots"]').attr("content") || "").toLowerCase();
    const isNoIndex = robotsMeta.includes("noindex");

    const title = $("title").first().text().trim();
    if (!title) {
      missingTitle.push({ page: page.url, detail: "Balise <title> manquante" });
    } else {
      if (title.length > 80) {
        longTitle.push({ page: page.url, detail: `${title.length} caractères: "${title.slice(0, 85)}…"` });
      }
      // Pages noindex exclues des doublons (non indexées par Google, faux positifs WooCommerce fréquents)
      if (!isNoIndex) {
        const normalizePageUrl = (u: string) => u.replace(/^http:\/\//, "https://").replace(/^(https:\/\/)www\./, "$1").replace(/\.html(\/\d+)?$/, "").replace(/\/\d+$/, "");
        const normalizedUrl = normalizePageUrl(page.url);
        const existing = titles.get(title) || [];
        if (!existing.some((u) => normalizePageUrl(u) === normalizedUrl)) {
          existing.push(page.url);
        }
        titles.set(title, existing);
      }
    }

    const desc = $('meta[name="description"]').attr("content")?.trim();
    const isSecondaryPage = isLegalOrUtilityPage(page.url, page.html);
    if (!desc) {
      if (!isSecondaryPage) {
        missingDesc.push({ page: page.url, detail: "Meta description manquante" });
      }
    } else if (desc.length > 156) {
      longDesc.push({ page: page.url, detail: `${desc.length} caractères` });
    }

    const h1s = $("h1");
    if (h1s.length === 0) {
      missingH1.push({ page: page.url, detail: "Aucun H1 sur la page" });
    } else if (h1s.length > 1) {
      multipleH1.push({ page: page.url, detail: `${h1s.length} H1 trouvés` });
    }

    // Heading hierarchy: no level should be skipped (e.g. H1 → H3 without H2)
    const headings: { level: number; text: string }[] = [];
    $("h1,h2,h3,h4,h5,h6").each((_, el) => {
      headings.push({ level: parseInt(el.tagName[1]), text: $(el).text().trim().slice(0, 60) });
    });
    let prevLevel = 0;
    for (const h of headings) {
      if (prevLevel > 0 && h.level > prevLevel + 1) {
        headingHierarchy.push({ page: page.url, detail: `H${h.level} après H${prevLevel} — saut de niveau : "${h.text}"` });
        break;
      }
      prevLevel = h.level;
    }

    // Featured image: og:image should be present on indexable pages
    if (!isNoIndex && !isLegalOrUtilityPage(page.url, page.html)) {
      const ogImage = $('meta[property="og:image"]').attr("content");
      if (!ogImage) {
        missingFeaturedImage.push({ page: page.url, detail: "Image de mise en avant absente (og:image manquant)" });
      }
    }
  }

  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      for (const url of urls) {
        duplicateTitles.push({ page: url, detail: `Même titre sur plusieurs pages: "${title.slice(0, 50)}…"` });
      }
    }
  }

  const checks = [
    make("missing-title", "seo", "Pages sans <title>", missingTitle),
    make("missing-desc", "seo", "Pages sans meta description", missingDesc),
    make("missing-h1", "seo", "Pages sans H1", missingH1),
    make("multiple-h1", "seo", "Pages avec plusieurs H1", multipleH1),
    make("duplicate-titles", "seo", "Titre identique sur plusieurs pages", duplicateTitles),
    make("long-title", "seo", "Titres SEO trop longs (>80 car.)", longTitle),
    make("long-desc", "seo", "Meta descriptions trop longues (>156 car.)", longDesc),
    make("heading-hierarchy", "seo", "Hiérarchie des titres incorrecte (H1→H3…)", headingHierarchy),
    make("missing-featured-image", "seo", "Pages sans image de mise en avant", missingFeaturedImage),
    checkBreadcrumbPresence(pages, baseUrl),
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
      label: "Google Analytics / Google Tag Manager",
      severity: hasGA ? "success" : "warning",
      count: hasGA ? 0 : 1,
      items: hasGA ? [] : [{ page: homepageGA.url, detail: "Aucun script Analytics ou Google Tag Manager détecté" }],
      tooltip: "Google Tag Manager (GTM) est un outil qui permet d'ajouter des scripts de suivi (Analytics, pixels pub…) sur un site sans toucher au code. Indispensable pour mesurer les visites et les conversions.",
    });
  }

  // Mixed content (HTTP resources on HTTPS page)
  if (baseUrl.startsWith("https://")) {
    const mixedContent: CheckItem[] = [];
    const seenPerPage = new Set<string>();
    for (const page of pages) {
      if (!page.html || !isHtmlPage(page)) continue;
      const $ = cheerio.load(page.html);
      $("img[src], script[src], link[href], iframe[src], source[src]").each((_, el) => {
        const resourceUrl = $(el).attr("src") || $(el).attr("href") || "";
        if (!resourceUrl.startsWith("http://")) return;
        const key = `${page.url}||${resourceUrl}`;
        if (seenPerPage.has(key)) return;
        seenPerPage.add(key);
        const filename = resourceUrl.split("/").pop()?.split("?")[0] || resourceUrl;
        mixedContent.push({ page: page.url, detail: `Ressource HTTP : ${filename}`, resourceUrl });
      });
    }
    checks.push(make("mixed-content", "technical", "Contenu mixte (HTTP sur HTTPS)", mixedContent));
  }

  return { id: "technical", label: "Technique", icon: "Settings", severity: worstSeverity(checks), checks };
}

// ─── 5. PERFORMANCE ─────────────────────────────────────────────
function checkPerformance(pages: PageData[]): CategoryResult {
  const slow: CheckItem[] = [];

  for (const page of pages) {
    if (page.loadTime > 5000) {
      slow.push({ page: page.url, detail: `${(page.loadTime / 1000).toFixed(1)}s de chargement` });
    }
  }

  const checks = [
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
async function checkRequiredPages(pages: PageData[], baseUrl: string): Promise<CategoryResult> {
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
    {
      id: "plan-du-site",
      label: "Plan du site",
      slugs: ["plan-du-site", "plan-site", "sitemap-page", "plan-du-site-nav", "plan-site-nav", "nav-link"],
      titles: ["plan du site", "plan de site"],
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

  // Page 404 personnalisée
  checks.push(await checkCustom404(baseUrl));

  return { id: "pages", label: "Pages", icon: "FileText", severity: worstSeverity(checks), checks };
}

// ─── 9. WORDPRESS ───────────────────────────────────────────────
async function checkWordPress(pages: PageData[], baseUrl: string): Promise<CategoryResult> {
  const loginResult = await checkLoginUrl(baseUrl);

  const checks: CheckResult[] = [
    loginResult,
  ];

  return { id: "wordpress", label: "WordPress", icon: "Globe", severity: worstSeverity(checks), checks };
}

function checkBreadcrumbPresence(pages: PageData[], baseUrl: string): CheckResult {
  const innerPages = pages.filter((p) => {
    if (!p.html || !isHtmlPage(p) || p.status >= 400) return false;
    try { return new URL(p.url).pathname !== "/"; } catch { return false; }
  });

  if (innerPages.length === 0) {
    return { id: "breadcrumb", category: "seo", label: "Fil d'ariane", severity: "success", count: 0, items: [] };
  }

  const hasBreadcrumb = (page: PageData) => {
    const $ = cheerio.load(page.html);
    // Require at least 1 link inside the breadcrumb element to avoid false positives
    const selectors = [
      ".yoast-breadcrumb",
      ".woocommerce-breadcrumb",
      ".rank-math-breadcrumb",
      ".et_pb_breadcrumbs",
      'nav[aria-label*="breadcrumb" i]',
      'nav[class*="breadcrumb" i]',
      '[class*="breadcrumb"]',
      '[class*="breadcrumbs"]',
      '[id*="breadcrumb"]',
    ];
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length > 0 && el.find("a").length >= 1) return true;
    }
    // JSON-LD BreadcrumbList with at least 2 items
    let found = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      const json = $(el).html() || "";
      if (json.includes("BreadcrumbList") && (json.match(/"item"/g) || []).length >= 2) found = true;
    });
    return found;
  };

  const withBreadcrumb = innerPages.filter(hasBreadcrumb);

  if (withBreadcrumb.length === 0) {
    const allItems = innerPages.slice(0, 50).map((p) => ({ page: p.url, detail: "Fil d'ariane absent" }));
    return { id: "breadcrumb", category: "seo", label: "Fil d'ariane", severity: "warning", count: allItems.length, items: allItems };
  }

  const missing = innerPages.filter((p) => !withBreadcrumb.includes(p)).slice(0, 20).map((p) => ({ page: p.url, detail: "Fil d'ariane absent" }));
  return make("breadcrumb", "seo", "Fil d'ariane", missing);
}


async function checkLoginUrl(baseUrl: string): Promise<CheckResult> {
  const exposed: CheckItem[] = [];

  for (const path of ["/wp-admin", "/wp-login.php"]) {
    try {
      const res = await fetch(baseUrl + path, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" },
      });
      if (res.status === 200 && (res.url.includes("wp-login") || res.url.includes("wp-admin"))) {
        exposed.push({ page: baseUrl + path, detail: `${path} est accessible (URL par défaut exposée)` });
      }
    } catch { /* timeout / réseau */ }
  }

  return make("login-url", "wordpress", "URL de connexion sécurisée", exposed);
}

async function checkCustom404(baseUrl: string): Promise<CheckResult> {
  const testUrl = baseUrl + "/cette-page-nexiste-pas-sitechecker-test";

  try {
    const res = await fetch(testUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "SiteChecker/1.0 (Com d'Artisans)" },
    });
    const html = await res.text();

    if (res.status !== 404) {
      return { id: "custom-404", category: "pages", label: "Page 404 personnalisée", severity: "warning", count: 1, items: [{ page: testUrl, detail: `Le serveur répond ${res.status} au lieu de 404 (soft 404 — mauvais pour le SEO)` }] };
    }

    const hasDesign = html.includes("elementor") || html.includes("wp-content/themes") || html.length > 5000;
    if (!hasDesign) {
      return { id: "custom-404", category: "pages", label: "Page 404 personnalisée", severity: "warning", count: 1, items: [{ page: baseUrl + "/404", detail: "Page 404 sans design personnalisé détecté" }] };
    }

    return { id: "custom-404", category: "pages", label: "Page 404 personnalisée", severity: "success", count: 0, items: [] };
  } catch {
    return { id: "custom-404", category: "pages", label: "Page 404 personnalisée", severity: "warning", count: 1, items: [{ page: testUrl, detail: "Impossible de vérifier la page 404 (délai dépassé)" }] };
  }
}

function normalizeForCheck(url: string): string {
  const u = new URL(url);
  u.protocol = "https:";
  u.hostname = u.hostname.replace(/^www\./, "");
  u.hash = "";
  u.search = "";
  let path = u.pathname;
  if (path.endsWith("/") && path !== "/") path = path.slice(0, -1);
  u.pathname = path;
  return u.href;
}
