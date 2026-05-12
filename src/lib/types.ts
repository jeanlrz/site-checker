export type Severity = "success" | "warning" | "error" | "info";

export interface CheckItem {
  page: string;
  element?: string;
  detail: string;
  resourceUrl?: string;
  highlight?: "danger" | "success";
}

export interface CheckResult {
  id: string;
  category: string;
  label: string;
  severity: Severity;
  count: number;
  items: CheckItem[];
  tooltip?: string;
}

export interface CategoryResult {
  id: string;
  label: string;
  icon: string;
  severity: Severity;
  checks: CheckResult[];
}

export interface ScanProgress {
  type: "progress";
  pagesScanned: number;
  totalPages: number;
  currentUrl: string;
  phase: string;
  resolvedUrl?: string;
}

export interface ScanDone {
  type: "done";
  categories: CategoryResult[];
  totalPages: number;
  duration: number;
  resolvedUrl: string;
  siteLogoUrl?: string;
}

export interface ScanError {
  type: "error";
  message: string;
}

export type ScanEvent = ScanProgress | ScanDone | ScanError;

export interface PageData {
  url: string;
  html: string;
  status: number;
  headers: Record<string, string>;
  loadTime: number;
  size: number;
}
