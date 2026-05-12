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
  "broken-links": 7,
  "empty-links": 7,
  "orphan-pages": 9,
  "no-external-links": 5,
  "weak-internal-links": 4,
  // Images
  "broken-images": 8,
  "no-alt": 5,
  "large-images": 4,
  "not-webp": 7,
  // Technique
  "mixed-content": 10,
  "lorem-ipsum": 9,
  "viewport": 8,
  "no-analytics": 6,
  "sitemap": 6,
  "favicon": 5,
  "robots": 5,
  // Performance
  "slow-pages": 6,
  // SEO — nouveaux
  "heading-hierarchy": 5,
  "missing-featured-image": 4,
  // WordPress
  "breadcrumb": 4,
  "login-url": 3,
  "custom-404": 4,
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

async function exportToDocx(
  categories: CategoryResult[],
  siteUrl: string,
  scanInfo: { totalPages: number; duration: number },
): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, UnderlineType, BorderStyle } = await import("docx");

  const FONT = "Roboto";
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const score = weightedScore(categories);

  const C = { brand: "2D6E53", green: "16a34a", amber: "d97706", red: "dc2626", gray: "9CA3AF", dark: "1F2937", light: "F3F4F6" };
  const sCol = (s: string) => s === "success" ? C.green : s === "warning" ? C.amber : C.red;
  const sLabel = (s: string) => s === "success" ? "✓" : s === "warning" ? "⚠" : "✗";
  const scoreCol = score >= 80 ? C.green : score >= 50 ? C.amber : C.red;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (text: string, opts: any = {}) => new TextRun({ text, font: FONT, ...opts });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  // ── En-tête ──
  children.push(new Paragraph({
    children: [run("Rapport d’audit", { bold: true, size: 64, color: C.brand })],
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [
      new ExternalHyperlink({
        link: siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`,
        children: [run(siteUrl, { size: 32, color: C.brand, underline: { type: UnderlineType.SINGLE } })],
      }),
    ],
    spacing: { after: 80 },
  }));
  children.push(new Paragraph({
    children: [run(`${scanInfo.totalPages} page${scanInfo.totalPages > 1 ? "s" : ""} analysée${scanInfo.totalPages > 1 ? "s" : ""} · ${date}`, { size: 24, color: C.gray })],
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [
      run("Score global  ", { size: 26, color: C.dark }),
      run(`${score} / 100`, { size: 34, bold: true, color: scoreCol }),
    ],
    spacing: { after: 600 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" } },
  }));

  // ── Catégories ──
  for (const cat of categories) {
    const issueCount = cat.checks.filter(c => c.severity !== "success").length;

    // Séparateur visuel entre catégories
    children.push(new Paragraph({ children: [], spacing: { before: 0, after: 0 }, pageBreakBefore: false }));

    // Titre catégorie
    children.push(new Paragraph({
      children: [
        run(cat.label.toUpperCase(), { bold: true, size: 28, color: C.brand, characterSpacing: 40 }),
        run(issueCount > 0 ? `   ${issueCount} problème${issueCount > 1 ? "s" : ""}` : "   Tout est OK", { size: 24, color: C.gray }),
      ],
      spacing: { before: 800, after: 180 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" } },
    }));

    const sorted = [...cat.checks].sort((a, b) => {
      const o: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 };
      return (o[a.severity] ?? 3) - (o[b.severity] ?? 3);
    });

    for (const check of sorted) {
      children.push(new Paragraph({
        children: [
          run(sLabel(check.severity) + "  ", { size: 24, bold: true, color: sCol(check.severity) }),
          run(check.label, { size: 24, bold: false, color: C.dark }),
          ...(check.count > 0 ? [run(`  (${check.count})`, { size: 22, color: C.gray })] : []),
        ],
        spacing: { before: 220, after: 80 },
      }));

      // Items avec liens cliquables
      for (const item of check.items.slice(0, 40)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runs: any[] = [];
        if (item.page?.startsWith("http")) {
          runs.push(new ExternalHyperlink({
            link: item.page,
            children: [run(shortUrl(item.page), { size: 22, color: C.brand, underline: { type: UnderlineType.SINGLE } })],
          }));
          runs.push(run("   ", { size: 22 }));
        }
        runs.push(run(item.detail, { size: 22, color: C.gray }));
        children.push(new Paragraph({ children: runs, indent: { left: 440 }, spacing: { after: 40 } }));
      }
      if (check.items.length > 40) {
        children.push(new Paragraph({
          children: [run(`… et ${check.items.length - 40} autres`, { size: 20, color: C.gray, italics: true })],
          indent: { left: 440 },
          spacing: { after: 40 },
        }));
      }
    }
  }

  // ── Pied de page ──
  children.push(new Paragraph({
    children: [run("Audit réalisé par Com d’Artisans — Site Checker", { size: 18, color: C.gray, italics: true })],
    spacing: { before: 800 },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" } },
  }));

  const doc = new Document({
    creator: "Site Checker — Com d’Artisans",
    title: `Rapport d’audit — ${siteUrl}`,
    styles: {
      default: {
        document: { run: { font: FONT, size: 22, color: C.dark } },
      },
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = `audit-${siteUrl.replace(/[^a-z0-9]/gi, "-")}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}

function exportToPdf(
  categories: CategoryResult[],
  siteUrl: string,
  scanInfo: { totalPages: number; duration: number },
): void {
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const score = weightedScore(categories);
  const scoreCol = score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const sCol = (s: string) => s === "success" ? "#16a34a" : s === "warning" ? "#d97706" : "#dc2626";
  const sIcon = (s: string) => s === "success" ? "✓" : s === "warning" ? "⚠" : "✗";

  let body = "";
  for (const cat of categories) {
    const issueCount = cat.checks.filter(c => c.severity !== "success").length;
    const sorted = [...cat.checks].sort((a, b) => {
      const o: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 };
      return (o[a.severity] ?? 3) - (o[b.severity] ?? 3);
    });
    body += `<div class="cat">
      <div class="cat-title">
        <span>${cat.label}</span>
        <span class="cat-count" style="color:${issueCount > 0 ? "#d97706" : "#16a34a"}">${issueCount > 0 ? `${issueCount} problème${issueCount > 1 ? "s" : ""}` : "Tout est OK"}</span>
      </div>`;
    for (const check of sorted) {
      const col = sCol(check.severity);
      body += `<div class="check">
        <div class="check-head">
          <span class="check-icon" style="color:${col}">${sIcon(check.severity)}</span>
          <span class="check-label">${check.label}</span>
          ${check.count > 0 ? `<span class="check-count">${check.count}</span>` : ""}
        </div>`;
      if (check.items.length > 0) {
        body += `<div class="items">`;
        for (const item of check.items.slice(0, 40)) {
          body += `<div class="item">`;
          if (item.page?.startsWith("http")) {
            body += `<a href="${item.page}" target="_blank" class="item-link">${shortUrl(item.page)}</a>`;
          }
          if (item.detail) body += `<div class="item-detail">${item.detail}</div>`;
          body += `</div>`;
        }
        if (check.items.length > 40) body += `<div class="item-more">… et ${check.items.length - 40} autres</div>`;
        body += `</div>`;
      }
      body += `</div>`;
    }
    body += `</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<title>Audit — ${siteUrl}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Jost',sans-serif; color:#1F2937; font-size:13px; line-height:1.6; padding:14mm 16mm; background:#fff; }
  .header { border-bottom:2px solid #2D6E53; padding-bottom:12px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:flex-end; }
  .header h1 { font-size:28px; font-weight:700; color:#2D6E53; }
  .header-meta { font-size:11px; color:#9CA3AF; margin-top:4px; }
  .header-right { text-align:right; }
  .site { font-size:14px; font-weight:600; color:#2D6E53; }
  .score-label { font-size:11px; color:#9CA3AF; }
  .score { font-size:26px; font-weight:700; color:${scoreCol}; }
  .cat { margin-bottom:28px; }
  .cat-title { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #E5E7EB; padding-bottom:6px; margin-bottom:10px; }
  .cat-title span:first-child { font-size:14px; font-weight:700; color:#2D6E53; letter-spacing:0.5px; text-transform:uppercase; }
  .cat-count { font-size:12px; font-weight:500; }
  .check { margin-bottom:12px; padding-left:10px; border-left:2px solid #F3F4F6; }
  .check-head { display:flex; align-items:baseline; gap:7px; margin-bottom:4px; }
  .check-icon { font-size:12px; font-weight:700; min-width:15px; }
  .check-label { font-size:13px; font-weight:600; color:#1F2937; flex:1; }
  .check-count { font-size:11px; color:#9CA3AF; background:#F3F4F6; padding:1px 7px; border-radius:10px; }
  .items { padding-left:22px; margin-top:4px; }
  .item { padding:5px 0; border-bottom:1px solid #F3F4F6; }
  .item:last-child { border-bottom:none; }
  .item-link { display:block; color:#2D6E53; text-decoration:underline; font-family:monospace; font-size:12px; word-break:break-all; margin-bottom:2px; }
  .item-detail { font-size:11.5px; color:#6B7280; }
  .item-more { font-size:11px; color:#9CA3AF; font-style:italic; padding-top:4px; }
  .footer { margin-top:24px; border-top:1px solid #E5E7EB; padding-top:8px; font-size:10px; color:#D1D5DB; display:flex; justify-content:space-between; }
  @media print {
    body { padding:12mm 14mm; }
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>Rapport d'audit</h1>
    <div class="header-meta">${scanInfo.totalPages} page${scanInfo.totalPages > 1 ? "s" : ""} analysée${scanInfo.totalPages > 1 ? "s" : ""} · ${date}</div>
  </div>
  <div class="header-right">
    <div class="site">${siteUrl}</div>
    <div class="score-label">Score global</div>
    <div class="score">${score}<span style="font-size:16px;color:#9CA3AF"> /100</span></div>
  </div>
</div>
${body}
<div class="footer">
  <span>Com d'Artisans — Site Checker</span>
  <span>${siteUrl}</span>
</div>
<script>
  document.fonts.ready.then(function() {
    setTimeout(function() { window.print(); }, 200);
  });
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, "_blank");
  if (!win) return;
  win.addEventListener("unload", () => { URL.revokeObjectURL(blobUrl); });
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
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  const [showPages, setShowPages] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [siteLogoUrl, setSiteLogoUrl] = useState("");
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
              <Button variant="outline" size="sm" disabled={isExporting} onClick={async () => { setIsExporting(true); try { await exportToDocx(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo); } finally { setIsExporting(false); } }} className="text-muted-foreground border-border/60 hover:bg-muted/50">
                <Download className="w-3 h-3 mr-1" />{isExporting ? "Génération…" : "Google Docs"}
              </Button>
              <Button variant="outline" size="sm" disabled={isExportingPdf} onClick={() => { setIsExportingPdf(true); try { exportToPdf(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo); } finally { setIsExportingPdf(false); } }} className="text-muted-foreground border-border/60 hover:bg-muted/50">
                <FileText className="w-3 h-3 mr-1" />{isExportingPdf ? "Génération…" : "PDF"}
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
                { icon: <Globe className="w-5 h-5" />, label: "WordPress", desc: "Vérifie que l'URL de connexion a été sécurisée (wp-login.php masqué)." },
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
                  disabled={isExporting}
                  onClick={async () => { setIsExporting(true); try { await exportToDocx(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo); } finally { setIsExporting(false); } }}
                  className="sm:hidden mb-2 text-muted-foreground border-border/60"
                >
                  <Download className="w-3 h-3 mr-1" />
                  {isExporting ? "Génération…" : "Google Docs"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExportingPdf}
                  onClick={() => { setIsExportingPdf(true); try { exportToPdf(results, scanUrl || url.replace(/^https?:\/\//, "").replace(/\/$/, ""), scanInfo); } finally { setIsExportingPdf(false); } }}
                  className="sm:hidden mb-2 text-muted-foreground border-border/60"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  {isExportingPdf ? "Génération…" : "PDF"}
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
        disabled={isOk && !check.tooltip}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/30 transition-colors disabled:hover:bg-transparent"
      >
        {severityIcon(check.severity)}
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

      {showTooltip && check.tooltip && (
        <div className="px-4 pb-3 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/40 bg-muted/20">
          {check.tooltip}
        </div>
      )}

      {expanded && !isOk && check.items.length > 0 && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
          {(showAll ? check.items : check.items.slice(0, 20)).map((item, i) => (
            <div key={i} className={`flex flex-col sm:flex-row sm:items-start gap-1 text-xs py-1 border-b border-border/40 last:border-0 ${item.highlight === "danger" ? "text-red-600" : item.highlight === "success" ? "text-green-600" : ""}`}>
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
