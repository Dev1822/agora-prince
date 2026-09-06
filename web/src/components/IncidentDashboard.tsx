"use client";

import { useEffect, useState } from "react";
import {
  getIncidents,
  getServiceHealth,
  getPostMortem,
  approvePendingAction,
  rejectPendingAction,
} from "@/services/api";
import type { Incident, ServiceHealth, PendingAction } from "@/services/api";
import { HumanConfirmationModal } from "@/components/HumanConfirmationModal";
import { PostMortemModal } from "@/components/PostMortemModal";
import { IncidentTimeline } from "@/components/IncidentTimeline";

const severityClasses: Record<Incident["severity"], string> = {
  low: "border-muted-foreground/30 bg-muted/30",
  medium: "border-yellow-500/40 bg-yellow-500/5",
  high: "border-orange-500/40 bg-orange-500/5",
  critical: "border-red-500/50 bg-red-500/10",
};

const statusLabels: Record<Incident["status"], string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const serviceStatusBadge: Record<string, string> = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  degraded: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  down: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

export function IncidentDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [selectedPendingAction, setSelectedPendingAction] = useState<{
    action: PendingAction;
    incidentId: string;
  } | null>(null);
  const [postMortemModal, setPostMortemModal] = useState<{
    isOpen: boolean;
    incident: Incident | null;
    markdown: string;
    loading: boolean;
  }>({ isOpen: false, incident: null, markdown: "", loading: false });

  const refreshDashboard = async () => {
    try {
      const [incidentsResult, servicesResult] = await Promise.allSettled([
        getIncidents(),
        getServiceHealth(),
      ]);

      if (incidentsResult.status === "fulfilled") {
        setIncidents(incidentsResult.value.incidents);
        setIncidentError(null);
      } else {
        console.error("Failed to load incidents:", incidentsResult.reason);
        setIncidentError("Unable to load incident data.");
      }

      if (servicesResult.status === "fulfilled") {
        setServices(servicesResult.value.services);
        setServiceError(null);
      } else {
        console.error("Failed to load service health:", servicesResult.reason);
        setServiceError("Unable to load system health.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAction = async (
    incidentId: string,
    actionId: string,
    approvedBy: string
  ) => {
    await approvePendingAction(incidentId, actionId, approvedBy);
    await refreshDashboard();
  };

  const handleRejectAction = async (
    incidentId: string,
    actionId: string,
    reason: string
  ) => {
    await rejectPendingAction(incidentId, actionId, reason);
    await refreshDashboard();
  };

  const handleOpenPostMortem = async (incident: Incident) => {
    setPostMortemModal({ isOpen: true, incident, markdown: "", loading: true });
    try {
      const result = await getPostMortem(incident.id);
      setPostMortemModal({
        isOpen: true,
        incident,
        markdown: result.markdown || "",
        loading: false,
      });
    } catch (err) {
      console.error("Failed to load post-mortem:", err);
      setPostMortemModal({
        isOpen: true,
        incident,
        markdown: "",
        loading: false,
      });
    }
  };

  useEffect(() => {
    refreshDashboard();

    const interval = setInterval(refreshDashboard, 3000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Loading Command Center...
      </div>
    );
  }

  return (
    <>
      <section className="flex h-full min-h-0 flex-col rounded-xl border bg-card/80 shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Incident Command Center</h2>
            <p className="text-xs text-muted-foreground">
              Live operational status
            </p>
          </div>

          <div className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
            {incidents.length} incident{incidents.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* SYSTEM HEALTH */}
        <div className="border-b px-4 py-3 bg-muted/10">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              System Health
            </h3>
          </div>

          {serviceError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              {serviceError}
            </div>
          ) : services.length === 0 ? (
            <div className="text-xs text-muted-foreground">No service health data available.</div>
          ) : (
            <div className="grid gap-1.5">
              {services.map((svc) => {
                const statusKey = svc.status.toLowerCase();
                const badgeClass =
                  serviceStatusBadge[statusKey] ||
                  "border-muted-foreground/30 bg-muted/20 text-muted-foreground";

                return (
                  <div
                    key={svc.name}
                    className="flex items-center justify-between rounded-md border bg-background/50 px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold uppercase truncate">
                        {svc.name}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${badgeClass}`}
                      >
                        {svc.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground shrink-0 font-mono text-[11px]">
                      <span>{svc.latency}</span>
                      <span className="w-12 text-right">{svc.error_rate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* INCIDENTS LIST */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {incidentError ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {incidentError}
            </div>
          ) : null}

          {incidents.length === 0 ? (
            <div className="flex h-full min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
              No active incidents.
              <br />
              Ask Ada to investigate a production issue.
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <article
                  key={incident.id}
                  className={`rounded-lg border p-3 ${severityClasses[incident.severity]}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {incident.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {incident.id}
                        {incident.service ? ` · ${incident.service}` : ""}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-background/70 px-2 py-1 text-[10px] font-semibold uppercase">
                      {incident.severity}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {statusLabels[incident.status]}
                    </span>

                    <span className="text-muted-foreground">
                      {incident.timeline.length} event
                      {incident.timeline.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {incident.impact}
                  </p>

                  {incident.root_cause ? (
                    <p className="mt-2 text-xs">
                      <span className="font-semibold">Root cause:</span>{" "}
                      {incident.root_cause}
                    </p>
                  ) : null}

                  {/* APPROVAL REQUIRED WARNING BANNER */}
                  {incident.pending_actions
                    ?.filter((a) => a.status === "pending")
                    .map((action) => (
                      <div
                        key={action.id}
                        className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 text-[11px]">
                            <span className="inline-block animate-pulse text-amber-500 font-extrabold text-sm">
                              ⚠
                            </span>
                            Approval Required
                          </span>
                          <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-700 dark:text-amber-300 uppercase">
                            Risk: {action.risk_level}
                          </span>
                        </div>

                        <p className="mt-1.5 font-semibold text-foreground text-xs">
                          {action.title || action.action}
                        </p>
                        <p className="mt-0.5 text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                          {action.details}
                        </p>

                        <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-amber-500/20">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Target: {action.target_resource}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPendingAction({
                                action,
                                incidentId: incident.id,
                              })
                            }
                            className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-500 transition-colors shadow-xs cursor-pointer"
                          >
                            Review & Authorize
                          </button>
                        </div>
                      </div>
                    ))}

                  {/* FACTS vs HYPOTHESES */}
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/40 pt-2.5 sm:grid-cols-2">
                    {/* FACTS */}
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          <span>✓</span> Facts ({incident.facts?.length || 0})
                        </span>
                      </div>

                      {!incident.facts || incident.facts.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">
                          No confirmed facts yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {incident.facts.map((fact) => (
                            <div
                              key={fact.id}
                              className="rounded border border-emerald-500/15 bg-background/70 p-1.5 text-xs shadow-xs"
                            >
                              <p className="font-medium leading-snug text-foreground">
                                {fact.text}
                              </p>
                              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="capitalize font-semibold text-emerald-600 dark:text-emerald-400">
                                  {fact.confidence} confidence
                                </span>
                                {fact.evidence ? (
                                  <span
                                    className="max-w-[120px] truncate rounded bg-muted/80 px-1 py-0.5 font-mono text-[9px]"
                                    title={fact.evidence}
                                  >
                                    {fact.evidence}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* HYPOTHESES */}
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          <span>?</span> Hypotheses ({incident.hypotheses?.length || 0})
                        </span>
                      </div>

                      {!incident.hypotheses || incident.hypotheses.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">
                          No hypotheses recorded.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {incident.hypotheses.map((hypo) => {
                            const statusLower = hypo.status?.toLowerCase();
                            const badgeStyle =
                              statusLower === "confirmed"
                                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : statusLower === "rejected"
                                ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground line-through"
                                : "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";

                            return (
                              <div
                                key={hypo.id}
                                className={`rounded border border-amber-500/15 bg-background/70 p-1.5 text-xs shadow-xs ${
                                  statusLower === "rejected" ? "opacity-75" : ""
                                }`}
                              >
                                <p
                                  className={`font-medium leading-snug ${
                                    statusLower === "rejected"
                                      ? "line-through text-muted-foreground"
                                      : "text-foreground"
                                  }`}
                                >
                                  {hypo.text}
                                </p>
                                <div className="mt-1 flex items-center justify-between text-[10px]">
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${badgeStyle}`}
                                  >
                                    {hypo.status}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CATEGORIZED INVESTIGATION TIMELINE */}
                  <IncidentTimeline events={incident.timeline} className="mt-3" />

                  {/* POST-MORTEM BUTTON */}
                  <div className="mt-3 border-t border-border/40 pt-2.5">
                    <button
                      type="button"
                      onClick={() => handleOpenPostMortem(incident)}
                      className={`w-full rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        incident.status === "resolved"
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                          : "bg-muted text-muted-foreground hover:bg-muted/80 border"
                      }`}
                    >
                      {incident.status === "resolved"
                        ? "View Post-Mortem Report"
                        : "View Interim Report"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* HUMAN CONFIRMATION MODAL */}
      {selectedPendingAction ? (
        <HumanConfirmationModal
          action={selectedPendingAction.action}
          incidentId={selectedPendingAction.incidentId}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
          onClose={() => setSelectedPendingAction(null)}
        />
      ) : null}

      {/* POST-MORTEM MODAL */}
      <PostMortemModal
        isOpen={postMortemModal.isOpen}
        incidentId={postMortemModal.incident?.id || ""}
        title={postMortemModal.incident?.title || ""}
        severity={postMortemModal.incident?.severity || ""}
        status={postMortemModal.incident?.status || ""}
        markdown={postMortemModal.markdown}
        loading={postMortemModal.loading}
        onClose={() =>
          setPostMortemModal({ isOpen: false, incident: null, markdown: "", loading: false })
        }
      />
    </>
  );
}