"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  Link,
  Image,
  Settings,
  Zap,
  Share2,
  Eye,
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Download,
  FileText,
  Info,
} from "lucide-react";
import type { CategoryResult, CheckResult, ScanEvent, Severity } from "@/lib/types";

const categoryDescriptions: Record<string, string> = {
  "Liens cassés": "Détecte les liens internes qui pointent vers des pages inexistantes (404) ou des liens vides.",
  "Images & alts": "Vérifie que toutes les images ont un texte alternatif pour l'accessibilité et le SEO.",
  "SEO": "Contrôle les balises title, meta description, H1 — essentielles pour le référencement.",
  "Technique": "Vérifie le favicon, le sitemap.xml, robots.txt, le responsive et le HTTPS.",
  "Performance": "Détecte les pages trop lourdes ou trop lentes au chargement.",
  "Open Graph": "Vérifie les balises de partage sur les réseaux sociaux (Facebook, LinkedIn…).",
  "Accessibilité": "Contrôle les labels de formulaires, les liens sans texte et l'attribut lang.",
  "WordPress": "Détecte les oublis courants : Lorem ipsum, slogan par défaut, Analytics absent.",
};

const categoryIcons: Record<string, React.ReactNode> = {
  Link: <Link className="w-4 h-4" />,
  Image: <Image className="w-4 h-4" />,
  Search: <Search className="w-4 h-4" />,
  Settings: <Settings className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  Share2: <Share2 className="w-4 h-4" />,
  Eye: <Eye className="w-4 h-4" />,
  Globe: <Globe className="w-4 h-4" />,
  FileText: <FileText className="w-4 h-4" />,
};

function severityColor(s: Severity) {
  switch (s) {
    case "success": return "text-green-600 bg-green-50 border-green-200";
    case "warning": return "text-amber-600 bg-amber-50 border-amber-200";
    case "error": return "text-red-600 bg-red-50 border-red-200";
    default: return "text-muted-foreground bg-muted border-border";
  }
}

function severityIcon(s: Severity) {
  switch (s) {
    case "success": return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    case "warning": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case "error": return <XCircle className="w-5 h-5 text-red-500" />;
    default: return null;
  }
}

function severityLabel(s: Severity) {
  switch (s) {
    case "success": return "OK";
    case "warning": return "Attention";
    case "error": return "Problème";
    default: return "";
  }
}

const CHECK_WEIGHTS: Record<string, number> = {
  // SEO — le plus impactant pour un site vitrine
  "missing-title": 10,
  "missing-desc": 8,
  "missing-h1": 7,
  "duplicate-titles": 7,
  "multiple-h1": 5,
  "long-title": 4,
  "long-desc": 3,
  // Légal — obligatoire en France
  "mentions-legales": 9,
  "politique-confidentialite": 9,
  "politique-cookies": 9,
  // Liens
  "broken-links": 8,
  "empty-links": 5,
  // Images
  "broken-images": 7,
  "no-alt": 6,
  "large-images": 4,
  "not-webp": 6,
  // Technique
  "lorem-ipsum": 9,
  "viewport": 8,
  "no-analytics": 6,
  "sitemap": 6,
  "favicon": 5,
  "robots": 5,
  // Performance
  "slow-pages": 6,
  "heavy-pages": 5,
  // SEO — nouveaux
  "heading-hierarchy": 5,
  "missing-featured-image": 4,
  // WordPress
  "breadcrumb": 4,
  "login-url": 6,
  "custom-404": 4,
  "plugins": 3,
  // Pages
  "plan-du-site": 3,
};

function weightedScore(categories: CategoryResult[]): number {
  let totalWeight = 0;
  let okWeight = 0;
  for (const cat of categories) {
    for (const check of cat.checks) {
      const w = CHECK_WEIGHTS[check.id] ?? 5;
      totalWeight += w;
      if (check.severity === "success") okWeight += w;
    }
  }
  if (totalWeight === 0) return 0;
  return Math.round((okWeight / totalWeight) * 100);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildPdfHtml(categories: CategoryResult[], siteUrl: string, scanInfo: { totalPages: number; duration: number }): string {
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const severityLabel = (s: string) => s === "success" ? "OK" : s === "warning" ? "Attention" : "Problème";
  const severityColor = (s: string) => s === "success" ? "#16a34a" : s === "warning" ? "#d97706" : "#dc2626";
  const severityBg = (s: string) => s === "success" ? "#f0fdf4" : s === "warning" ? "#fffbeb" : "#fef2f2";

  const categoriesHtml = categories.map(cat => {
    const checksHtml = [...cat.checks].sort((a, b) => {
      const o: Record<string, number> = { error: 0, warning: 1, success: 2 };
      return (o[a.severity] ?? 2) - (o[b.severity] ?? 2);
    }).map(check => {
      const itemsHtml = check.items.slice(0, 30).map(item =>
        "<tr style='border-bottom:1px solid #f0f0f0'>" +
        "<td style='padding:5px 10px;font-family:monospace;font-size:11px;color:#337C5F;width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc(item.page.replace(/^https?:\/\//, "")) + "</td>" +
        "<td style='padding:5px 10px;font-size:11px;color:#333;width:50%'>" + esc(item.detail) + "</td>" +
        "</tr>"
      ).join("");
      return "<div class='check'>" +
        "<div class='check-head' style='background:" + severityBg(check.severity) + "'>" +
        "<span class='dot' style='background:" + severityColor(check.severity) + "'></span>" +
        "<span class='check-label'>" + esc(check.label) + "</span>" +
        "<span class='check-status' style='color:" + severityColor(check.severity) + "'>" + severityLabel(check.severity) + (check.count > 0 ? " (" + check.count + ")" : "") + "</span>" +
        "</div>" +
        (check.items.length > 0 ? "<table>" + itemsHtml + "</table>" : "") +
        (check.items.length > 30 ? "<p class='more'>… et " + (check.items.length - 30) + " autres</p>" : "") +
        "</div>";
    }).join("");
    const catColor = severityColor(cat.severity);
    return "<div class='cat'>" +
      "<h2 class='cat-title' style='border-color:" + catColor + ";color:" + catColor + "'>" + esc(cat.label) + "</h2>" +
      checksHtml +
      "</div>";
  }).join("");

  const score = weightedScore(categories);
  const scoreColor = score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;color:#111;background:#fff;padding:32px 24px;font-size:13px;line-height:1.5}
    .report-header{overflow:hidden;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #e5e7eb}
    .report-header-info{overflow:hidden}
    .score-box{float:right;text-align:center;margin-left:24px}
    .cat{margin-bottom:24px}
    .cat-title{font-size:15px;font-weight:700;margin:0 0 10px;padding-bottom:5px;border-bottom-width:2px;border-bottom-style:solid}
    .check{margin-bottom:7px;border:1px solid #e5e7eb;border-radius:7px;overflow:hidden}
    .check-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 12px}
    .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
    .check-label{font-weight:600;font-size:12px;flex:1;min-width:0}
    .check-status{font-size:11px;font-weight:600;white-space:nowrap}
    table{width:100%;border-collapse:collapse;font-size:11px}
    td{padding:4px 10px;border-bottom:1px solid #f0f0f0;word-break:break-word}
    td:first-child{color:#337C5F;font-family:monospace;width:45%;max-width:280px}
    td:last-child{color:#333;width:55%}
    .more{padding:4px 12px;font-size:11px;color:#888}
    @media (max-width:480px){
      body{padding:16px 12px;font-size:12px}
      .score-box{width:100%}
      td:first-child{width:40%}
      td:last-child{width:60%}
    }
    @media print{
      body{padding:16px 12px}
      .no-print{display:none!important}
    }
  `;

  return "<!DOCTYPE html><html lang=’fr’><head><meta charset=’UTF-8’><meta name=’viewport’ content=’width=device-width,initial-scale=1’><style>" + css + "</style></head><body>" +
    "<div class=’report-header’>" +
    "<div class=’report-header-info’><p style=’font-size:11px;color:#888;margin-bottom:3px’>Audit réalisé par Com d’Artisans</p>" +
    "<p style=’font-size:20px;font-weight:800;color:#337C5F’>" + esc(siteUrl) + "</p>" +
    "<p style=’font-size:11px;color:#888;margin-top:3px’>" + scanInfo.totalPages + " page" + (scanInfo.totalPages > 1 ? "s" : "") + " analysée" + (scanInfo.totalPages > 1 ? "s" : "") + " · " + date + "</p></div>" +
    "<div class=’score-box’><p style=’font-size:72px;font-weight:900;color:" + scoreColor + ";line-height:1’>" + score + "</p><p style=’font-size:11px;color:#888;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em’>Score global</p></div>" +
    "</div>" +
    categoriesHtml +
    "</body></html>";
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ phase: "", pagesScanned: 0, totalPages: 0, currentUrl: "" });
  const [results, setResults] = useState<CategoryResult[] | null>(null);
  const [scanInfo, setScanInfo] = useState({ totalPages: 0, duration: 0 });
  const [scanUrl, setScanUrl] = useState("");
  const [error, setError] = useState("");
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  const [showPages, setShowPages] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [pdfHtml, setPdfHtml] = useState("");
  const [siteLogoUrl, setSiteLogoUrl] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (showPdf && iframeRef.current && pdfHtml) {
      iframeRef.current.srcdoc = pdfHtml;
    }
    document.body.style.overflow = showPdf ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showPdf, pdfHtml]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("scan-history") || "[]");
      if (Array.isArray(saved)) setHistory(saved);
    } catch { /* ignore */ }
  }, []);

  const toggleCheck = (id: string) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleScan = async () => {
    if (!url.trim()) return;
    try {
      const u = new URL(url.trim().startsWith("http") ? url.trim() : "https://" + url.trim());
      if (!/\.[a-z]{2,}$/i.test(u.hostname)) {
        setError("URL invalide — vérifiez que le domaine contient bien une extension (.fr, .com…)");
        return;
      }
    } catch {
      setError("URL invalide — exemple : https://monsite.fr");
      return;
    }
    setIsScanning(true);
    setResults(null);
    setError("");
    setScanUrl("");
    setScannedPages([]);
    setShowPages(false);
    setSiteLogoUrl("");
    setProgress({ phase: "Démarrage...", pagesScanned: 0, totalPages: 0, currentUrl: "" });

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors du scan.");
        setIsScanning(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setError("Impossible de lire le flux."); setIsScanning(false); return; }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: ScanEvent = JSON.parse(line.slice(6));
            if (event.type === "progress") {
              setProgress({ phase: event.phase, pagesScanned: event.pagesScanned, totalPages: event.totalPages, currentUrl: event.currentUrl });
              if (event.resolvedUrl) setScanUrl(event.resolvedUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""));
              if (event.currentUrl) setScannedPages(prev => prev.includes(event.currentUrl) ? prev : [...prev, event.currentUrl]);
            } else if (event.type === "done") {
              setResults(event.categories);
              setScanInfo({ totalPages: event.totalPages, duration: event.duration });
              const resolved = event.resolvedUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
              setScanUrl(resolved);
              if (event.siteLogoUrl) setSiteLogoUrl(event.siteLogoUrl);
              setHistory(prev => {
                const updated = [resolved, ...prev.filter(h => h !== resolved)].slice(0, 20);
                try { localStorage.setItem("scan-history", JSON.stringify(updated)); } catch { /* ignore */ }
                return updated;
              });
              setIsScanning(false);
            } else if (event.type === "error") {
              setError(event.message);
              setIsScanning(false);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erreur de connexion.");
      setIsScanning(false);
    }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setIsScanning(false);
    setResults(null);
    setError("");
    setUrl("");
    setExpandedChecks(new Set());
  };

  const [showConfirm, setShowConfirm] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const askConfirm = (action: () => void) => {
    if (!isScanning && !results) { action(); return; }
    pendingActionRef.current = action;
    setShowConfirm(true);
  };

  const confirmLeave = () => {
    setShowConfirm(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  };

  const cancelLeave = () => {
    setShowConfirm(false);
    pendingActionRef.current = null;
  };

  useEffect(() => {
    if (!isScanning) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isScanning]);

  useEffect(() => {
    if (!isScanning && !results) return;
    const guardPath = window.location.pathname + window.location.search;
    window.history.pushState(null, "");
    const handlePopState = () => {
      const newPath = window.location.pathname + window.location.search;
      // Ignore hash-only navigation (anchors within the page)
      if (newPath === guardPath) {
        window.history.pushState(null, "");
        return;
      }
      window.history.pushState(null, "");
      pendingActionRef.current = () => {
        abortRef.current?.abort();
        setIsScanning(false);
        setResults(null);
        setError("");
        setUrl("");
        setExpandedChecks(new Set());
      };
      setShowConfirm(true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isScanning, results]);

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const globalScore = results ? weightedScore(results) : 0;

  const scoreColor = globalScore >= 80 ? "text-green-600" : globalScore >= 50 ? "text-amber-500" : "text-red-500";
  const scoreRing = globalScore >= 80 ? "ring-green-200" : globalScore >= 50 ? "ring-amber-200" : "ring-red-200";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white sticky top-0 z-50">
        {/* Desktop : logo centré, boutons absolus à droite */}
        <div className="hidden sm:flex w-[85vw] mx-auto px-6 py-4 relative items-center justify-center">
          <div className="flex flex-row items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Com d'Artisans"
              className="h-10 cursor-pointer"
              onClick={() => askConfirm(() => { window.location.hash = ""; window.location.reload(); })}
            />
            <div className="w-px h-6 bg-border self-center" />
            <div className="flex flex-col items-start">
              <span className="text-base font-medium text-muted-foreground">Site Checker</span>
              {(results || isScanning) && url && (
                <a href={`https://${scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand font-mono hover:underline">{scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
              )}
            </div>
          </div>
          {results && (
            <div className="absolute right-6 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setPdfHtml(buildPdfHtml(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo)); setShowPdf(true); }} className="text-muted-foreground border-border/60 hover:bg-muted/50">
                <Download className="w-3 h-3 mr-1" />Exporter PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setResults(null); setError(""); setExpandedChecks(new Set()); window.location.hash = ""; handleScan(); }} className="text-brand border-brand/30 hover:bg-brand/5">
                <RotateCcw className="w-3 h-3 mr-1" />Rescanner
              </Button>
              <Button variant="ghost" size="sm" onClick={() => askConfirm(() => { handleReset(); window.location.hash = ""; })} className="text-muted-foreground">
                Nouveau scan
              </Button>
            </div>
          )}
        </div>
        {/* Mobile : colonne centrée */}
        <div className="sm:hidden flex flex-col items-center gap-3 px-4 py-4">
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Com d'Artisans"
              className="h-9 cursor-pointer"
              onClick={() => askConfirm(() => { window.location.hash = ""; window.location.reload(); })}
            />
            <span className="text-sm font-medium text-muted-foreground">Site Checker</span>
            {(results || isScanning) && url && (
              <a href={`https://${scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand font-mono hover:underline">{scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
            )}
          </div>
          {results && (
            <div className="flex flex-col items-center gap-2 w-full">
              <Button variant="outline" size="sm" onClick={() => { setResults(null); setError(""); setExpandedChecks(new Set()); window.location.hash = ""; handleScan(); }} className="w-full text-brand border-brand/30">
                <RotateCcw className="w-3 h-3 mr-1" />Rescanner
              </Button>
              <Button variant="ghost" size="sm" onClick={() => askConfirm(() => { handleReset(); window.location.hash = ""; })} className="w-full text-muted-foreground">
                Nouveau scan
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="w-full max-w-[95vw] md:max-w-[85vw] mx-auto px-4 md:px-6 py-8">
        {/* URL Input */}
        {!results && !isScanning && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Analysez votre site web en 1 clic</h1>
              <p className="text-muted-foreground text-lg">Entrez l&apos;URL de votre site pour lancer l&apos;audit complet.</p>
            </div>

            <div className="w-full max-w-[85vw] flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="https://monsite.fr"
                  value={url}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleScan(); }}
                  className="w-full h-12 px-4 rounded-xl border border-border bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-all"
                />
              </div>
              <Button
                onClick={handleScan}
                disabled={!url.trim()}
                className="h-12 px-8 bg-brand hover:bg-brand-dark text-white text-base font-semibold shadow-lg shadow-brand/20 disabled:opacity-40 disabled:shadow-none"
              >
                <Search className="w-4 h-4 mr-2" />
                Scanner
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 w-full max-w-[85vw]">
                {error}
              </div>
            )}

            <div className="w-full max-w-[85vw] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-muted-foreground mt-4">
              {[
                { icon: <Link className="w-5 h-5" />, label: "Liens cassés", desc: "Détecte les liens internes qui pointent vers des pages inexistantes (404) ou des boutons sans lien." },
                { icon: <Image className="w-5 h-5" />, label: "Images & alts", desc: "Liste les images sans texte alternatif et les images non converties en WebP." },
                { icon: <Search className="w-5 h-5" />, label: "SEO", desc: "Contrôle title, meta description, H1, hiérarchie des titres, image de mise en avant — détecte les absences, doublons et textes trop longs." },
                { icon: <Settings className="w-5 h-5" />, label: "Technique", desc: "Vérifie le favicon, sitemap.xml, robots.txt, le responsive et Google Tag Manager." },
                { icon: <Zap className="w-5 h-5" />, label: "Performance", desc: "Détecte les pages trop lourdes ou trop lentes au chargement." },
                { icon: <FileText className="w-5 h-5" />, label: "Pages", desc: "Vérifie mentions légales, confidentialité, cookies, plan du site, fil d'ariane et page 404 personnalisée." },
                { icon: <Globe className="w-5 h-5" />, label: "WordPress", desc: "Liste les plugins actifs (Envato, UpdraftPlus, MainWP, Akismet signalés) et vérifie l'URL de connexion." },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 p-4 rounded-xl bg-white border border-border">
                  <div className="text-brand mt-0.5 shrink-0">{item.icon}</div>
                  <div>
                    <p className="font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scanning Progress */}
        {isScanning && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <Loader2 className="w-12 h-12 text-brand animate-spin" />
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">{progress.phase}</h2>
              <p className="text-muted-foreground">
                {progress.pagesScanned} page{progress.pagesScanned > 1 ? "s" : ""} scannée{progress.pagesScanned > 1 ? "s" : ""}
              </p>
              {progress.currentUrl && (
                <p className="text-xs text-muted-foreground font-mono truncate w-full max-w-[90vw] px-4">
                  {progress.currentUrl}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { abortRef.current?.abort(); setIsScanning(false); }}>
              Annuler
            </Button>
          </div>
        )}

        {/* Results Dashboard */}
        {results && (
          <div className="space-y-8">
            {/* Score global */}
            <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-white rounded-2xl border border-border">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center ring-4 ${scoreRing} bg-white shrink-0`}>
                <span className={`text-3xl font-bold ${scoreColor}`}>{globalScore}</span>
              </div>
              <div className="flex-1 text-center sm:text-left min-w-0">
                <a href={`https://${scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center sm:justify-start gap-2 mb-1 group w-fit mx-auto sm:mx-0">
                  {siteLogoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={siteLogoUrl} alt="Logo" className="h-7 w-auto max-w-[120px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <p className="text-sm font-semibold text-brand truncate group-hover:underline">{scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPdfHtml(buildPdfHtml(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo)); setShowPdf(true); }}
                  className="sm:hidden mb-2 text-muted-foreground border-border/60"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Exporter PDF
                </Button>
                <h2 className="text-xl font-bold">
                  {globalScore >= 80 ? "Bon travail !" : globalScore >= 50 ? "Des points à corriger" : "Attention, plusieurs problèmes"}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {scanInfo.totalPages} page{scanInfo.totalPages > 1 ? "s" : ""} analysée{scanInfo.totalPages > 1 ? "s" : ""} en {(scanInfo.duration / 1000).toFixed(1)}s
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowPages(v => !v)}>
                <FileText className="w-3 h-3 mr-1" />
                {scanInfo.totalPages} page{scanInfo.totalPages > 1 ? "s" : ""} analysée{scanInfo.totalPages > 1 ? "s" : ""}
              </Button>
            </div>

            {showPages && (
              <div className="mt-3 border-t pt-3 max-h-48 overflow-y-auto">
                {[...scannedPages].filter(p => !/\.(png|jpe?g|gif|webp|svg|pdf|zip|mp4|mp3|css|js|ico|woff2?)(\?.*)?$/i.test(p)).sort((a, b) => a.localeCompare(b)).map((p, i) => (
                  <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="block text-xs font-mono text-brand hover:underline truncate py-0.5">{p.replace(/^https?:\/\//, "")}</a>
                ))}
              </div>
            )}

            {/* Résumé catégories */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {results.map((cat) => (
                <a
                  key={cat.id}
                  href={`#cat-${cat.id}`}
                  className={`flex items-center gap-2 p-3 rounded-xl border transition-all hover:shadow-md ${severityColor(cat.severity)}`}
                >
                  <span className="shrink-0">{severityIcon(cat.severity)}</span>
                  <div>
                    <p className="text-sm font-semibold">{cat.label}</p>
                    <p className="text-xs opacity-75">
                      {cat.checks.filter((c) => c.severity !== "success").length} problème{cat.checks.filter((c) => c.severity !== "success").length > 1 ? "s" : ""}
                    </p>
                  </div>
                </a>
              ))}
            </div>

            {/* Détail par catégorie */}
            {results.map((cat) => (
              <Card key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-24">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {categoryIcons[cat.icon]}
                    {cat.label}
                    <Badge variant={cat.severity === "success" ? "default" : cat.severity === "warning" ? "secondary" : "destructive"}>
                      {cat.checks.filter((c) => c.severity === "success").length}/{cat.checks.length} OK
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[...cat.checks].sort((a, b) => {
                    const order = { error: 0, warning: 1, info: 2, success: 3 };
                    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
                    return a.label.localeCompare(b.label, "fr");
                  }).map((check) => (
                    <CheckRow key={check.id} check={check} expanded={expandedChecks.has(check.id)} onToggle={() => toggleCheck(check.id)} />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-border shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Abandonner l&apos;analyse ?</h2>
            <p className="text-sm text-muted-foreground">
              {isScanning ? "L'analyse est en cours. Si vous quittez, elle sera annulée." : "Vous quitterez les résultats en cours."}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={cancelLeave}>
                Rester
              </Button>
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={confirmLeave}>
                Quitter
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPdf && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0 gap-2">
            <span className="text-sm font-medium truncate">{scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")} — Rapport</span>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => iframeRef.current?.contentWindow?.print()} className="bg-brand hover:bg-brand-dark text-white">
                <Download className="w-3 h-3 mr-1" />Imprimer / PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPdf(false)}>
                Fermer
              </Button>
            </div>
          </div>
          <iframe ref={iframeRef} className="flex-1 w-full border-0" title="Rapport PDF" />
        </div>
      )}

      <footer className="mt-auto border-t py-4">
        <div className="w-[85vw] mx-auto px-4 md:px-6 flex items-center justify-center gap-1 text-sm text-muted-foreground">
          <span>Com d&apos;Artisans</span>
          <span>—</span>
          <span>Site Checker</span>
        </div>
      </footer>
    </div>
  );
}

function CheckRow({ check, expanded, onToggle }: { check: CheckResult; expanded: boolean; onToggle: () => void }) {
  const isOk = check.severity === "success";
  const isPlugins = check.id === "plugins";
  const [showAll, setShowAll] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={`rounded-lg border ${isOk && !isPlugins ? "border-green-100 bg-green-50/50" : "border-border bg-white"}`}>
      <button
        onClick={onToggle}
        disabled={isOk && !check.tooltip && !isPlugins}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/30 transition-colors disabled:hover:bg-transparent"
      >
        {!isPlugins && severityIcon(check.severity)}
        <span className="flex-1 font-medium flex items-center gap-1.5">
          {check.label}
          {check.tooltip && (
            <span
              className="inline-flex"
              onClick={(e) => { e.stopPropagation(); setShowTooltip(v => !v); }}
            >
              <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-brand transition-colors cursor-pointer shrink-0" />
            </span>
          )}
        </span>
        {!isOk && !isPlugins && (
          <Badge variant="outline" className="text-xs">
            {check.count}
          </Badge>
        )}
        {isOk && !isPlugins ? (
          <span className="text-xs text-green-600 font-medium">OK</span>
        ) : expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {showTooltip && check.tooltip && (
        <div className="px-4 pb-3 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/40 bg-muted/20">
          {check.tooltip}
        </div>
      )}

      {expanded && (isPlugins || !isOk) && check.items.length > 0 && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
          {(showAll ? check.items : check.items.slice(0, 20)).map((item, i) => (
            <div key={i} className={`flex flex-col sm:flex-row sm:items-start gap-1 text-xs py-1 border-b border-border/40 last:border-0 ${item.highlight === "danger" ? "text-red-600" : item.highlight === "success" ? "text-green-600" : ""}`}>
              {isPlugins ? (
                <span className={`font-mono font-medium ${item.highlight === "danger" ? "text-red-600" : "text-green-600"}`}>{item.detail}</span>
              ) : (
                <>
                  {item.page && (
                    <a
                      href={item.page}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-brand hover:text-brand-dark hover:underline truncate max-w-xs shrink-0"
                      title={item.page}
                    >
                      {shortUrl(item.page)}
                    </a>
                  )}
                  {item.element && (
                    item.resourceUrl
                      ? <a href={item.resourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground font-mono shrink-0 hover:text-brand hover:underline">{item.element}</a>
                      : <span className="text-muted-foreground font-mono shrink-0">{item.element}</span>
                  )}
                  <span className="text-foreground">{item.detail}</span>
                </>
              )}
            </div>
          ))}
          {check.items.length > 20 && !showAll && (
            <button onClick={() => setShowAll(true)} className="text-xs text-brand hover:underline mt-1">
              … voir les {check.items.length - 20} autres
            </button>
          )}
          {showAll && check.items.length > 20 && (
            <button onClick={() => setShowAll(false)} className="text-xs text-muted-foreground hover:underline mt-1">
              Réduire
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}
