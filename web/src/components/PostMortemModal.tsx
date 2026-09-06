"use client";

import { useState } from "react";

interface PostMortemModalProps {
  isOpen: boolean;
  incidentId: string;
  title: string;
  severity: string;
  status: string;
  markdown: string;
  loading: boolean;
  onClose: () => void;
}

export function PostMortemModal({
  isOpen,
  incidentId,
  title,
  severity,
  status,
  markdown,
  loading,
  onClose,
}: PostMortemModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy markdown to clipboard:", err);
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `incident-${incidentId.toLowerCase()}-postmortem.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download post-mortem file:", err);
    }
  };

  const severityBadgeClass =
    severity === "critical"
      ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
      : severity === "high"
      ? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400"
      : severity === "medium"
      ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
      : "border-muted-foreground/30 bg-muted/20 text-muted-foreground";

  const statusBadgeClass =
    status === "resolved"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="postmortem-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-3xl rounded-xl border bg-card p-6 shadow-2xl transition-all max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4 shrink-0">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs text-primary">
                Incident Post-Mortem Report
              </span>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${severityBadgeClass}`}
              >
                {severity}
              </span>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass}`}
              >
                {status}
              </span>
            </div>
            <h2 id="postmortem-modal-title" className="mt-1 text-base font-semibold text-foreground truncate">
              {incidentId}: {title}
            </h2>
            <p className="text-xs text-muted-foreground">
              Authoritative post-incident summary compiled deterministically from incident telemetry.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            X
          </button>
        </div>

        {/* Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-xs text-muted-foreground animate-pulse">
                Compiling post-mortem from incident telemetry...
              </p>
            </div>
          ) : !markdown ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No post-mortem report data available.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Action Toolbar */}
              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 border text-xs">
                <span className="text-muted-foreground font-mono text-[11px]">
                  Format: GitHub Flavored Markdown (.md)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-xs font-medium border hover:bg-muted transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Copied!
                      </span>
                    ) : (
                      <span>Copy Markdown</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
                  >
                    <span>Download .md</span>
                  </button>
                </div>
              </div>

              {/* Markdown Display */}
              <div className="rounded-lg border bg-muted/20 p-4 font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed select-text overflow-x-auto max-h-[52vh] overflow-y-auto">
                {markdown}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t pt-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border bg-background px-4 py-2 text-xs font-medium hover:bg-muted transition-colors cursor-pointer"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
