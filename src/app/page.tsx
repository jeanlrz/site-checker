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

function generatePdf(categories: CategoryResult[], siteUrl: string, scanInfo: { totalPages: number; duration: number }) {
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
        `<tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#337C5F;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.page.replace(/^https?:\/\//, "")}</td>
          ${item.element ? `<td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#888">${item.element}</td>` : "<td></td>"}
          <td style="padding:4px 8px;font-size:11px;color:#333">${item.detail}</td>
        </tr>`
      ).join("");
      return `
        <div style="margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${severityBg(check.severity)}">
            <span style="width:10px;height:10px;border-radius:50%;background:${severityColor(check.severity)};flex-shrink:0"></span>
            <span style="font-weight:600;font-size:13px;flex:1">${check.label}</span>
            <span style="font-size:12px;color:${severityColor(check.severity)};font-weight:600">${severityLabel(check.severity)}${check.count > 0 ? ` (${check.count})` : ""}</span>
          </div>
          ${check.items.length > 0 ? `<table style="width:100%;border-collapse:collapse;font-size:11px">${itemsHtml}</table>` : ""}
          ${check.items.length > 30 ? `<p style="padding:4px 14px;font-size:11px;color:#888">… et ${check.items.length - 30} autres</p>` : ""}
        </div>`;
    }).join("");
    const catColor = severityColor(cat.severity);
    return `
      <div style="margin-bottom:28px;page-break-inside:avoid">
        <h2 style="font-size:16px;font-weight:700;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid ${catColor};color:${catColor}">${cat.label}</h2>
        ${checksHtml}
      </div>`;
  }).join("");

  const score = weightedScore(categories);
  const scoreColor = score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Audit — ${siteUrl}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; color: #111; background: #fff; padding: 40px; font-size: 14px; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
    }
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #e5e7eb">
    <div>
      <p style="font-size:12px;color:#888;margin-bottom:4px">Audit réalisé par Com d'Artisans</p>
      <h1 style="font-size:22px;font-weight:800;color:#337C5F">${siteUrl}</h1>
      <p style="font-size:12px;color:#888;margin-top:4px">${scanInfo.totalPages} page${scanInfo.totalPages > 1 ? "s" : ""} analysée${scanInfo.totalPages > 1 ? "s" : ""} · ${date}</p>
    </div>
    <div style="text-align:center;background:#f8f8f8;border-radius:12px;padding:16px 24px">
      <p style="font-size:36px;font-weight:900;color:${scoreColor};line-height:1">${score}</p>
      <p style="font-size:11px;color:#888;margin-top:4px">Score global</p>
    </div>
  </div>
  <div class="no-print" style="margin-bottom:24px">
    <button onclick="window.print()" style="background:#337C5F;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">Imprimer / Enregistrer en PDF</button>
  </div>
  ${categoriesHtml}
  </body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank");
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
  const abortRef = useRef<AbortController | null>(null);

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
                <span className="text-xs text-brand font-mono">{scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
              )}
            </div>
          </div>
          {results && (
            <div className="absolute right-6 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => generatePdf(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo)} className="text-muted-foreground border-border/60 hover:bg-muted/50">
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
              <span className="text-xs text-brand font-mono">{scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
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
              <h1 className="text-3xl font-bold tracking-tight">Vérifiez votre site web en 1 clic</h1>
              <p className="text-muted-foreground text-lg">Entrez l&apos;URL de votre site pour lancer l&apos;audit complet.</p>
            </div>

            <div className="w-full max-w-[85vw] flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="https://monsite.fr"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setShowSuggestions(true); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { setShowSuggestions(false); handleScan(); } if (e.key === "Escape") setShowSuggestions(false); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  className="w-full h-12 px-4 rounded-xl border border-border bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-all"
                />
                {showSuggestions && history.filter(h => h.includes(url.replace(/^https?:\/\//, "").replace(/\/$/, ""))).length > 0 && (
                  <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                    {history.filter(h => h.includes(url.replace(/^https?:\/\//, "").replace(/\/$/, ""))).slice(0, 8).map(h => (
                      <li key={h} className="flex items-center justify-between px-4 py-2.5 hover:bg-brand/5 group">
                        <span
                          onMouseDown={() => { setUrl(h); setShowSuggestions(false); }}
                          className="flex-1 text-sm font-mono cursor-pointer text-foreground group-hover:text-brand transition-colors truncate"
                        >{h}</span>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setHistory(prev => {
                              const updated = prev.filter(x => x !== h);
                              try { localStorage.setItem("scan-history", JSON.stringify(updated)); } catch { /* ignore */ }
                              return updated;
                            });
                          }}
                          className="ml-2 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                        >✕</button>
                      </li>
                    ))}
                  </ul>
                )}
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
                { icon: <Image className="w-5 h-5" />, label: "Images & alts", desc: "Vérifie que toutes les images ont un texte alternatif, détecte les images cassées, trop lourdes et non converties en WebP." },
                { icon: <Search className="w-5 h-5" />, label: "SEO", desc: "Contrôle les balises title, meta description et H1 — détecte les absences, doublons et textes trop longs (seuils Yoast)." },
                { icon: <Settings className="w-5 h-5" />, label: "Technique", desc: "Vérifie le favicon, sitemap.xml, robots.txt, le responsive, Lorem ipsum et Google Tag Manager." },
                { icon: <Zap className="w-5 h-5" />, label: "Performance", desc: "Détecte les pages trop lourdes ou trop lentes au chargement." },
                { icon: <FileText className="w-5 h-5" />, label: "Pages", desc: "Vérifie la présence des pages obligatoires : mentions légales, politique de confidentialité et politique de cookies." },
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
                <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
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
              <div className={`w-24 h-24 rounded-full flex items-center justify-center ring-4 ${scoreRing} bg-white`}>
                <span className={`text-3xl font-bold ${scoreColor}`}>{globalScore}</span>
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm font-semibold text-brand mb-1">{scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => generatePdf(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo)}
              className="sm:hidden w-full text-muted-foreground border-border/60"
            >
              <Download className="w-3 h-3 mr-1" />
              Exporter PDF
            </Button>

            {showPages && (
              <div className="mt-3 border-t pt-3 max-h-48 overflow-y-auto">
                {scannedPages.map((p, i) => (
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
                  {severityIcon(cat.severity)}
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
  const [showAll, setShowAll] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={`rounded-lg border ${isOk ? "border-green-100 bg-green-50/50" : "border-border bg-white"}`}>
      <button
        onClick={onToggle}
        disabled={isOk}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/30 transition-colors disabled:hover:bg-transparent"
      >
        {severityIcon(check.severity)}
        <span className="flex-1 font-medium flex items-center gap-1.5">
          {check.label}
          {check.tooltip && (
            <span
              className="relative inline-flex"
              onClick={(e) => { e.stopPropagation(); setShowTooltip(v => !v); }}
            >
              <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-brand transition-colors cursor-pointer shrink-0" />
              {showTooltip && (
                <span className="absolute left-1/2 -translate-x-1/2 top-6 z-50 w-64 max-w-[calc(100vw-2rem)] text-xs text-foreground bg-white border border-border rounded-lg shadow-lg p-3 font-normal leading-relaxed">
                  {check.tooltip}
                </span>
              )}
            </span>
          )}
        </span>
        {!isOk && (
          <Badge variant="outline" className="text-xs">
            {check.count}
          </Badge>
        )}
        {isOk ? (
          <span className="text-xs text-green-600 font-medium">OK</span>
        ) : expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && !isOk && check.items.length > 0 && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
          {(showAll ? check.items : check.items.slice(0, 20)).map((item, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-1 text-xs py-1 border-b border-border/40 last:border-0">
              <a
                href={item.page}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-brand hover:text-brand-dark hover:underline truncate max-w-xs shrink-0"
                title={item.page}
              >
                {shortUrl(item.page)}
              </a>
              {item.element && (
                item.resourceUrl
                  ? <a href={item.resourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground font-mono shrink-0 hover:text-brand hover:underline">{item.element}</a>
                  : <span className="text-muted-foreground font-mono shrink-0">{item.element}</span>
              )}
              <span className="text-foreground">{item.detail}</span>
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
