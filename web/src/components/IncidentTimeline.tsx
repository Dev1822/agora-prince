"use client";

import { useMemo, useState } from "react";
import type { TimelineEvent } from "@/services/api";

interface IncidentTimelineProps {
  events: TimelineEvent[];
  className?: string;
  defaultExpanded?: boolean;
}

type FilterCategory = "all" | "lifecycle" | "fact" | "hypothesis" | "authorization" | "action" | "note";

interface CategoryConfig {
  label: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  dotColor: string;
  icon: string;
}

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  lifecycle: {
    label: "LIFECYCLE",
    badgeBg: "bg-blue-500/10",
    badgeBorder: "border-blue-500/30",
    badgeText: "text-blue-600 dark:text-blue-400",
    dotColor: "bg-blue-500 ring-blue-500/30",
    icon: "⚡",
  },
  incident_created: {
    label: "INCIDENT",
    badgeBg: "bg-purple-500/10",
    badgeBorder: "border-purple-500/30",
    badgeText: "text-purple-600 dark:text-purple-400",
    dotColor: "bg-purple-500 ring-purple-500/30",
    icon: "🚨",
  },
  fact: {
    label: "FACT",
    badgeBg: "bg-emerald-500/10",
    badgeBorder: "border-emerald-500/30",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    dotColor: "bg-emerald-500 ring-emerald-500/30",
    icon: "✓",
  },
  hypothesis: {
    label: "HYPOTHESIS",
    badgeBg: "bg-amber-500/10",
    badgeBorder: "border-amber-500/30",
    badgeText: "text-amber-600 dark:text-amber-400",
    dotColor: "bg-amber-500 ring-amber-500/30",
    icon: "💡",
  },
  authorization: {
    label: "AUTHORIZATION",
    badgeBg: "bg-rose-500/10",
    badgeBorder: "border-rose-500/30",
    badgeText: "text-rose-600 dark:text-rose-400",
    dotColor: "bg-rose-500 ring-rose-500/30",
    icon: "🛡️",
  },
  action: {
    label: "ACTION",
    badgeBg: "bg-cyan-500/10",
    badgeBorder: "border-cyan-500/30",
    badgeText: "text-cyan-600 dark:text-cyan-400",
    dotColor: "bg-cyan-500 ring-cyan-500/30",
    icon: "⚙️",
  },
  note: {
    label: "NOTE",
    badgeBg: "bg-zinc-500/10",
    badgeBorder: "border-zinc-500/30",
    badgeText: "text-zinc-600 dark:text-zinc-400",
    dotColor: "bg-zinc-400 ring-zinc-400/30",
    icon: "📝",
  },
};

function resolveEventCategory(event: TimelineEvent): string {
  if (event.category && CATEGORY_CONFIGS[event.category.toLowerCase()]) {
    return event.category.toLowerCase();
  }

  const evt = event.event?.toLowerCase() || "";
  if (evt === "incident_created") return "incident_created";
  if (evt === "status_changed") return "lifecycle";
  if (evt === "fact_recorded") return "fact";
  if (evt.startsWith("hypothesis_")) return "hypothesis";
  if (evt.startsWith("action_") && evt !== "action_completed") return "authorization";
  if (evt === "action_completed" || evt === "action_executed") return "action";
  if (evt === "note_added" || evt === "investigation_note") return "note";

  return "lifecycle";
}

function formatEventTime(isoString: string): { timeStr: string; fullStr: string } {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) {
      return { timeStr: isoString, fullStr: isoString };
    }
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return {
      timeStr: `${hours}:${minutes}:${seconds}`,
      fullStr: d.toLocaleString(),
    };
  } catch {
    return { timeStr: isoString, fullStr: isoString };
  }
}

export function IncidentTimeline({
  events,
  className = "",
  defaultExpanded = true,
}: IncidentTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Category counts
  const counts = useMemo(() => {
    const res: Record<string, number> = {
      all: events.length,
      lifecycle: 0,
      fact: 0,
      hypothesis: 0,
      authorization: 0,
      action: 0,
      note: 0,
    };

    for (const evt of events) {
      const cat = resolveEventCategory(evt);
      if (cat === "incident_created" || cat === "lifecycle") {
        res.lifecycle = (res.lifecycle || 0) + 1;
      } else if (res[cat] !== undefined) {
        res[cat] = (res[cat] || 0) + 1;
      }
    }
    return res;
  }, [events]);

  // Filtered and sorted events
  const filteredEvents = useMemo(() => {
    let list = [...events];

    if (activeFilter !== "all") {
      list = list.filter((evt) => {
        const cat = resolveEventCategory(evt);
        if (activeFilter === "lifecycle") {
          return cat === "lifecycle" || cat === "incident_created";
        }
        return cat === activeFilter;
      });
    }

    list.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [events, activeFilter, sortOrder]);

  // Find index of the chronologically newest event in the original list
  const latestTimestamp = useMemo(() => {
    if (events.length === 0) return null;
    let maxTime = 0;
    let maxTs = events[0].timestamp;
    for (const evt of events) {
      const t = new Date(evt.timestamp).getTime() || 0;
      if (t >= maxTime) {
        maxTime = t;
        maxTs = evt.timestamp;
      }
    }
    return maxTs;
  }, [events]);

  if (!events || events.length === 0) {
    return (
      <div className={`rounded-md border bg-muted/10 p-3 text-center text-xs text-muted-foreground ${className}`}>
        No timeline events recorded yet.
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border/60 bg-background/50 text-xs shadow-xs ${className}`}>
      {/* HEADER WITH CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-foreground hover:text-primary transition-colors cursor-pointer"
          >
            <span className="text-[10px] text-muted-foreground">{isExpanded ? "▼" : "▶"}</span>
            <span>Investigation Timeline</span>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-mono text-primary">
              {events.length}
            </span>
          </button>
        </div>

        {isExpanded && (
          <div className="flex items-center gap-1.5">
            {/* SORT TOGGLE */}
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors cursor-pointer"
              title={sortOrder === "asc" ? "Chronological (Oldest first)" : "Reverse Chronological (Newest first)"}
            >
              <span>{sortOrder === "asc" ? "1 → N (Oldest)" : "N → 1 (Newest)"}</span>
              <span className="text-[9px]">{sortOrder === "asc" ? "↑" : "↓"}</span>
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          {/* CATEGORY FILTER PILLS */}
          <div className="flex flex-wrap items-center gap-1 border-b border-border/40 bg-muted/10 px-3 py-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                activeFilter === "all"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("lifecycle")}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                activeFilter === "lifecycle"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-blue-600/80 dark:text-blue-400/80 hover:bg-blue-500/10"
              }`}
            >
              Lifecycle ({counts.lifecycle})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("fact")}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                activeFilter === "fact"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-emerald-600/80 dark:text-emerald-400/80 hover:bg-emerald-500/10"
              }`}
            >
              Facts ({counts.fact})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("hypothesis")}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                activeFilter === "hypothesis"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-amber-600/80 dark:text-amber-400/80 hover:bg-amber-500/10"
              }`}
            >
              Hypotheses ({counts.hypothesis})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("authorization")}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                activeFilter === "authorization"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-rose-600/80 dark:text-rose-400/80 hover:bg-rose-500/10"
              }`}
            >
              Auth ({counts.authorization})
            </button>
            {counts.action > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter("action")}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                  activeFilter === "action"
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "text-cyan-600/80 dark:text-cyan-400/80 hover:bg-cyan-500/10"
                }`}
              >
                Actions ({counts.action})
              </button>
            )}
            {counts.note > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter("note")}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                  activeFilter === "note"
                    ? "bg-zinc-600 text-white shadow-xs"
                    : "text-zinc-600/80 dark:text-zinc-400/80 hover:bg-zinc-500/10"
                }`}
              >
                Notes ({counts.note})
              </button>
            )}
          </div>

          {/* TIMELINE EVENTS LIST */}
          <div className="max-h-72 overflow-y-auto p-3 space-y-2.5">
            {filteredEvents.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-muted-foreground italic">
                No events in this category.
              </div>
            ) : (
              <div className="relative pl-3 border-l-2 border-border/40 ml-1.5 space-y-3">
                {filteredEvents.map((evt, idx) => {
                  const catKey = resolveEventCategory(evt);
                  const config = CATEGORY_CONFIGS[catKey] || CATEGORY_CONFIGS.lifecycle;
                  const { timeStr, fullStr } = formatEventTime(evt.timestamp);
                  const isLatest = evt.timestamp === latestTimestamp;

                  return (
                    <div
                      key={`${evt.timestamp}-${evt.event}-${idx}`}
                      className="relative group transition-opacity"
                    >
                      {/* RAIL DOT */}
                      <span
                        className={`absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full ring-2 ${config.dotColor} ${
                          isLatest ? "animate-pulse" : ""
                        }`}
                      />

                      <div className="rounded-md border border-border/40 bg-card/60 p-2 hover:bg-muted/30 transition-colors shadow-2xs">
                        {/* HEADER: TIMESTAMP + CATEGORY BADGE + LATEST INDICATOR */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5">
                            {/* TIMESTAMP */}
                            <span
                              className="font-mono text-[10px] font-semibold text-muted-foreground"
                              title={fullStr}
                            >
                              {timeStr}
                            </span>

                            {/* CATEGORY BADGE */}
                            <span
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${config.badgeBg} ${config.badgeBorder} ${config.badgeText}`}
                            >
                              <span className="text-[10px]">{config.icon}</span>
                              {config.label}
                            </span>
                          </div>

                          {/* LATEST BADGE OR SPECIFIC TAGS */}
                          <div className="flex items-center gap-1">
                            {isLatest && (
                              <span className="rounded bg-primary/20 px-1 py-0.2 text-[8px] font-mono font-bold uppercase text-primary">
                                Latest
                              </span>
                            )}
                            {evt.metadata?.confidence && (
                              <span className="rounded bg-emerald-500/10 px-1 py-0.2 text-[8px] font-mono uppercase text-emerald-600 dark:text-emerald-400">
                                {evt.metadata.confidence}
                              </span>
                            )}
                            {evt.metadata?.risk_level && (
                              <span className="rounded bg-rose-500/10 px-1 py-0.2 text-[8px] font-mono uppercase text-rose-600 dark:text-rose-400">
                                Risk: {evt.metadata.risk_level}
                              </span>
                            )}
                            {evt.metadata?.status && (
                              <span className="rounded bg-muted px-1 py-0.2 text-[8px] font-mono uppercase text-muted-foreground">
                                {evt.metadata.status}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* EVENT DETAILS */}
                        <p className="font-medium text-foreground text-[11px] leading-relaxed break-words">
                          {evt.details}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
