export type Severity = "success" | "warning" | "error" | "info";

export interface CheckItem {
  page: string;
  element?: string;
  detail: string;
  resourceUrl?: string;
}

export interface CheckResult {
  id: string;
  category: string;
  label: string;
  severity: Severity;
  count: number;
  items: CheckItem[];
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
}

export interface ScanDone {
  type: "done";
  categories: CategoryResult[];
  totalPages: number;
  duration: number;
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
