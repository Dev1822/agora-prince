"use client";

import { useState } from "react";
import type { PendingAction } from "@/services/api";

interface HumanConfirmationModalProps {
  action: PendingAction;
  incidentId: string;
  onApprove: (incidentId: string, actionId: string, approvedBy: string) => Promise<void>;
  onReject: (incidentId: string, actionId: string, reason: string) => Promise<void>;
  onClose: () => void;
}

const suggestedRoles = [
  "Incident Lead",
  "Database Admin",
  "SRE",
  "Engineering Lead",
  "DevOps Engineer",
];

const riskStyles: Record<string, string> = {
  critical: "bg-red-500/15 text-red-500 border-red-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  low: "bg-blue-500/15 text-blue-500 border-blue-500/30",
};

export function HumanConfirmationModal({
  action,
  incidentId,
  onApprove,
  onReject,
  onClose,
}: HumanConfirmationModalProps) {
  const [approverRole, setApproverRole] = useState("Incident Lead");
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const riskKey = action.risk_level?.toLowerCase() || "high";
  const riskClass = riskStyles[riskKey] || riskStyles.high;

  const handleConfirmApproval = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onApprove(incidentId, action.id, approverRole);
      onClose();
    } catch (err: unknown) {
      console.error("Failed to approve action:", err);
      setError(err instanceof Error ? err.message : "Failed to approve action.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onReject(incidentId, action.id, rejectReason || "Rejected by human operator.");
      onClose();
    } catch (err: unknown) {
      console.error("Failed to reject action:", err);
      setError(err instanceof Error ? err.message : "Failed to reject action.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${riskClass}`}>
                Risk: {action.risk_level}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{incidentId}</span>
            </div>
            <h2 className="mt-1.5 text-base font-bold">Human Authorization Safeguard</h2>
            <p className="text-xs text-muted-foreground">
              Ada identified a high-risk remediation requiring explicit human approval.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {/* Action Details */}
        <div className="mt-4 space-y-2.5 rounded-lg border bg-muted/20 p-3.5 text-xs">
          <div>
            <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block mb-0.5">
              Proposed Operation
            </span>
            <span className="font-bold text-sm text-foreground">{action.title || action.action}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase block">Target Resource</span>
              <span className="font-mono font-semibold text-foreground">{action.target_resource}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase block">Action ID</span>
              <span className="font-mono text-foreground">{action.id}</span>
            </div>
          </div>

          <div className="pt-1 border-t border-border/40">
            <span className="text-[10px] text-muted-foreground uppercase block mb-0.5">Details & Scope</span>
            <p className="text-foreground leading-relaxed bg-background/50 p-2 rounded border border-border/40 font-mono text-[11px]">
              {action.details}
            </p>
          </div>
        </div>

        {/* Form Controls */}
        <div className="mt-4">
          {!isRejecting ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-foreground">
                  Authorizing Role / Lead
                </label>
                <select
                  value={approverRole}
                  onChange={(e) => setApproverRole(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  disabled={submitting}
                >
                  {suggestedRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg border px-3.5 py-2 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setIsRejecting(true)}
                  disabled={submitting}
                  className="rounded-lg border border-destructive/40 text-destructive px-3.5 py-2 text-xs font-semibold hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  Deny Execution
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApproval}
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-xs font-bold hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {submitting ? "Authorizing..." : "Authorize Action"}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConfirmRejection} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-destructive">
                  Reason for Denying Execution
                </label>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Database team has not verified replica sync"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-destructive"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRejecting(false)}
                  disabled={submitting}
                  className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-destructive text-destructive-foreground px-3.5 py-1.5 text-xs font-bold hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
