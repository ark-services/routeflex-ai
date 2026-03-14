"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  FileText,
  Link2,
  Users,
  ShieldCheck,
  ChevronDown,
  X,
  Check,
  Copy,
  ArrowRight,
  HelpCircle,
  MousePointerClick,
  ToggleLeft,
  ClipboardPaste,
  Zap,
  Loader2,
} from "lucide-react";
import {
  setupAiScreeningAutomation,
  setupFadvAutomation,
} from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";

const DISMISS_KEY = "workflow_guide_dismissed";
const LINK_COPIED_KEY = "workflow_guide_link_copied";
const formVisitedKey = (jobId: string) => `workflow_guide_form_visited_${jobId}`;

interface SetupGuideProps {
  companyId: string;
  jobId: string;
  applicantCount: number;
  fadvConnected: boolean;
  hasFadvSubmission: boolean;
  hasFadvAutomation: boolean;
  formPublicToken: string | null;
  integrationHref: string;
}

type Step = {
  key: string;
  label: string;
  description: string;
  icon: typeof Briefcase;
  done: boolean;
  action?: "link" | "copy" | "link-integration" | "copy-with-help" | "ai-screening" | "fadv-setup";
  href?: string;
};

function IndeedHelpModal({
  applyUrl,
  onClose,
  onCopy,
  copyFeedback,
}: {
  applyUrl: string | null;
  onClose: () => void;
  onCopy: () => void;
  copyFeedback: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-rf-surface-card rounded-rf-lg shadow-xl border border-rf-ink-100 w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rf-ink-100">
          <div>
            <h2 className="text-sm font-semibold text-rf-text-primary">How to update your Indeed ad</h2>
            <p className="text-xs text-rf-text-muted mt-0.5">Route applicants to your RouteFlex job page</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-rf-sm text-rf-text-muted hover:text-rf-text-secondary hover:bg-rf-surface-page transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto overflow-x-hidden min-w-0">
          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-rf-blue text-white flex items-center justify-center text-xs font-bold">
                1
              </div>
              <div className="w-0.5 flex-1 my-1 bg-rf-ink-100" />
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <MousePointerClick size={13} className="text-rf-ink-500" />
                <span className="text-sm font-medium text-rf-text-primary">Open your Indeed job posting</span>
              </div>
              <p className="text-xs text-rf-text-muted leading-relaxed">
                Go to your Indeed employer dashboard, find the job posting, and click <strong className="text-rf-text-secondary">Edit</strong>.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-rf-blue text-white flex items-center justify-center text-xs font-bold">
                2
              </div>
              <div className="w-0.5 flex-1 my-1 bg-rf-ink-100" />
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <HelpCircle size={13} className="text-rf-ink-500" />
                <span className="text-sm font-medium text-rf-text-primary">Find Application method under Settings</span>
              </div>
              <p className="text-xs text-rf-text-muted leading-relaxed">
                Scroll down to the <strong className="text-rf-text-secondary">Settings</strong> section and click the pencil icon next to <strong className="text-rf-text-secondary">Application method</strong>.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-rf-blue text-white flex items-center justify-center text-xs font-bold">
                3
              </div>
              <div className="w-0.5 flex-1 my-1 bg-rf-ink-100" />
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <ToggleLeft size={13} className="text-rf-ink-500" />
                <span className="text-sm font-medium text-rf-text-primary">Turn off "Receive applications on Indeed"</span>
              </div>
              <p className="text-xs text-rf-text-muted leading-relaxed">
                Toggle off <strong className="text-rf-text-secondary">Receive applications on Indeed</strong>. This reveals a field where you can enter an external application URL.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-rf-blue text-white flex items-center justify-center text-xs font-bold">
                4
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <ClipboardPaste size={13} className="text-rf-ink-500" />
                <span className="text-sm font-medium text-rf-text-primary">Paste your RouteFlex link</span>
              </div>
              <p className="text-xs text-rf-text-muted leading-relaxed mb-2">
                Paste this URL into <strong className="text-rf-text-secondary">Where should people apply to this job?</strong>, then click <strong className="text-rf-text-secondary">Done</strong> and <strong className="text-rf-text-secondary">Save changes</strong>.
              </p>

              {/* URL display + copy */}
              {applyUrl ? (
                <div className="flex items-center gap-2 bg-rf-surface-page rounded-rf-sm border border-rf-ink-100 px-3 py-2 min-w-0">
                  <span className="flex-1 text-xs text-rf-text-secondary font-mono truncate">{applyUrl}</span>
                  <button
                    type="button"
                    onClick={onCopy}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-rf-blue hover:text-rf-blue-dark transition-colors"
                  >
                    {copyFeedback ? (
                      <><Check size={12} /> Copied!</>
                    ) : (
                      <><Copy size={12} /> Copy</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-rf-text-muted bg-rf-surface-page rounded-rf-sm border border-rf-ink-100 px-3 py-2">
                  Complete step 2 (edit your form) first to generate your application link.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-rf-ink-100 bg-rf-surface-page/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-rf-text-primary bg-rf-surface-card border border-rf-ink-200 rounded-rf-sm hover:bg-rf-surface-page transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function SetupGuide({
  companyId,
  jobId,
  applicantCount,
  fadvConnected,
  hasFadvSubmission,
  hasFadvAutomation,
  formPublicToken,
  integrationHref,
}: SetupGuideProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [formVisited, setFormVisited] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showIndeedHelp, setShowIndeedHelp] = useState(false);
  const [aiScreeningLoading, setAiScreeningLoading] = useState(false);
  const [aiScreeningToast, setAiScreeningToast] = useState<string | null>(null);
  const [fadvSetupLoading, setFadvSetupLoading] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
    setLinkCopied(localStorage.getItem(LINK_COPIED_KEY) === "true");
    setFormVisited(localStorage.getItem(formVisitedKey(jobId)) === "true");
  }, [jobId]);

  if (dismissed) return null;

  const formHref = `/dashboard/${companyId}/jobs/${jobId}/form`;
  const applyUrl = formPublicToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/apply/${jobId}/${formPublicToken}`
    : null;

  const steps: Step[] = [
    {
      key: "create-job",
      label: "Create a job",
      description: "You've created your first job",
      icon: Briefcase,
      done: true,
    },
    {
      key: "edit-form",
      label: "Edit your application form",
      description: "Customize what applicants fill out",
      icon: FileText,
      done: formVisited,
      action: "link",
      href: formHref,
    },
    {
      key: "share-link",
      label: "Update your Indeed ad",
      description: "Add this link to your Indeed ad so the application takes place on your RouteFlex job page.",
      icon: Link2,
      done: linkCopied,
      action: "copy-with-help",
    },
    {
      key: "screen-applicants",
      label: "Screen applicants",
      description: "Review applicants as they come in",
      icon: Users,
      done: applicantCount > 0,
      action: "ai-screening",
    },
    {
      key: "submit-fadv",
      label: "Submit to First Advantage",
      description: fadvConnected
        ? hasFadvAutomation
          ? "Run background checks on applicants"
          : "Set up automated FADV submission"
        : "Connect First Advantage to run background checks",
      icon: ShieldCheck,
      done: fadvConnected && hasFadvAutomation,
      action: !fadvConnected
        ? "link-integration"
        : !hasFadvAutomation
        ? "fadv-setup"
        : undefined,
      href: !fadvConnected ? integrationHref : undefined,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPct = (completedCount / steps.length) * 100;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  const handleCopyLink = async () => {
    if (!applyUrl) return;
    try {
      await navigator.clipboard.writeText(applyUrl);
      localStorage.setItem(LINK_COPIED_KEY, "true");
      setLinkCopied(true);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Fallback silently
    }
  };

  const handleAiScreening = async () => {
    setAiScreeningLoading(true);
    try {
      const result = await setupAiScreeningAutomation(companyId, jobId);
      if (result.alreadyExists) {
        setAiScreeningToast("AI screening automation already exists");
        setTimeout(() => setAiScreeningToast(null), 3000);
      } else {
        // Navigate with ?automate=open to open the automation panel
        router.push(
          `/dashboard/${companyId}/jobs/${jobId}/applicants?automate=open`
        );
      }
    } catch (err: any) {
      setAiScreeningToast(err.message || "Failed to set up AI screening");
      setTimeout(() => setAiScreeningToast(null), 4000);
    } finally {
      setAiScreeningLoading(false);
    }
  };

  const handleFadvSetup = async () => {
    setFadvSetupLoading(true);
    try {
      const result = await setupFadvAutomation(companyId, jobId);
      if (result.alreadyExists) {
        setAiScreeningToast("FADV submission automation already exists");
        setTimeout(() => setAiScreeningToast(null), 3000);
      } else {
        router.push(
          `/dashboard/${companyId}/jobs/${jobId}/applicants?automate=open`
        );
      }
    } catch (err: any) {
      setAiScreeningToast(err.message || "Failed to set up FADV automation");
      setTimeout(() => setAiScreeningToast(null), 4000);
    } finally {
      setFadvSetupLoading(false);
    }
  };

  return (
    <>
      {showIndeedHelp && (
        <IndeedHelpModal
          applyUrl={applyUrl}
          onClose={() => setShowIndeedHelp(false)}
          onCopy={handleCopyLink}
          copyFeedback={copyFeedback}
        />
      )}

      {/* AI screening toast */}
      {aiScreeningToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-rf-ink-900 text-white text-sm px-4 py-2 rounded-rf-md shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {aiScreeningToast}
        </div>
      )}

      <div className="mx-8 mt-4 mb-1 bg-rf-surface-card border border-rf-ink-100 rounded-rf-lg shadow-rf-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* Progress ring */}
          <div className="relative flex-shrink-0 w-7 h-7">
            <svg viewBox="0 0 28 28" className="w-7 h-7 -rotate-90">
              <circle
                cx="14"
                cy="14"
                r="11"
                fill="none"
                stroke="var(--rf-ink-100)"
                strokeWidth="3"
              />
              <circle
                cx="14"
                cy="14"
                r="11"
                fill="none"
                stroke="var(--rf-blue)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${(progressPct / 100) * 69.1} 69.1`}
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-rf-text-primary">
              {completedCount}/{steps.length}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-rf-text-primary">
              Getting Started
            </span>
            <span className="text-xs text-rf-text-muted ml-2">
              {completedCount === steps.length
                ? "All done!"
                : `${completedCount} of ${steps.length} complete`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-rf-sm text-rf-text-muted hover:text-rf-text-secondary hover:bg-rf-surface-page transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-rf-sm text-rf-text-muted hover:text-rf-danger hover:bg-rf-danger-bg transition-colors"
            aria-label="Dismiss setup guide"
          >
            <X size={14} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-rf-ink-100/50">
          <div
            className="h-full bg-rf-blue transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps — collapsible */}
        <div
          className="transition-[max-height,opacity] duration-300 ease-out overflow-hidden"
          style={{
            maxHeight: expanded ? "420px" : "0px",
            opacity: expanded ? 1 : 0,
          }}
        >
          <div className="px-4 py-3">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isLast = idx === steps.length - 1;

              return (
                <div key={step.key} className="flex gap-3">
                  {/* Step number + connector line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        step.done
                          ? "bg-rf-success text-white"
                          : "border-2 border-rf-ink-300 text-rf-ink-400"
                      }`}
                    >
                      {step.done ? <Check size={12} strokeWidth={3} /> : idx + 1}
                    </div>
                    {!isLast && (
                      <div
                        className={`w-0.5 flex-1 my-1 ${
                          step.done ? "bg-rf-success/40" : "bg-rf-ink-100"
                        }`}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-3"}`}>
                    <div className="flex items-center gap-2">
                      <Icon
                        size={14}
                        className={`flex-shrink-0 ${
                          step.done ? "text-rf-text-muted" : "text-rf-ink-500"
                        }`}
                      />
                      <span
                        className={`text-sm font-medium leading-tight ${
                          step.done
                            ? "line-through text-rf-text-muted"
                            : "text-rf-text-primary"
                        }`}
                      >
                        {step.label}
                      </span>

                      {/* Action buttons */}
                      {step.action === "link" && step.href && !step.done && (
                        <Link
                          href={step.href}
                          onClick={() => {
                            localStorage.setItem(formVisitedKey(jobId), "true");
                            setFormVisited(true);
                          }}
                          className="ml-auto flex items-center gap-1 text-xs font-medium text-rf-blue hover:text-rf-blue-dark transition-colors cursor-pointer"
                        >
                          Edit Form
                          <ArrowRight size={12} />
                        </Link>
                      )}
                      {step.action === "copy-with-help" && !step.done && (
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowIndeedHelp(true)}
                            className="flex items-center gap-1 text-xs font-medium text-rf-text-muted hover:text-rf-blue transition-colors cursor-pointer"
                          >
                            <HelpCircle size={12} />
                            Show Me
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            disabled={!applyUrl}
                            className="flex items-center gap-1 text-xs font-medium text-rf-blue hover:text-rf-blue-dark transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {copyFeedback ? (
                              <><Check size={12} /> Copied!</>
                            ) : (
                              <><Copy size={12} /> Copy Link</>
                            )}
                          </button>
                        </div>
                      )}
                      {step.action === "link-integration" && step.href && !step.done && (
                        <Link
                          href={step.href}
                          className="ml-auto flex items-center gap-1 text-xs font-medium text-rf-blue hover:text-rf-blue-dark transition-colors cursor-pointer"
                        >
                          Connect
                          <ArrowRight size={12} />
                        </Link>
                      )}
                      {step.action === "ai-screening" && (
                        <button
                          type="button"
                          onClick={handleAiScreening}
                          disabled={aiScreeningLoading}
                          className="ml-auto flex items-center gap-1 text-xs font-medium text-rf-blue hover:text-rf-blue-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {aiScreeningLoading ? (
                            <><Loader2 size={12} className="animate-spin" /> Setting up...</>
                          ) : (
                            <><Zap size={12} /> Pre-Screen with AI</>
                          )}
                        </button>
                      )}
                      {step.action === "fadv-setup" && (
                        <button
                          type="button"
                          onClick={handleFadvSetup}
                          disabled={fadvSetupLoading}
                          className="ml-auto flex items-center gap-1 text-xs font-medium text-rf-blue hover:text-rf-blue-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {fadvSetupLoading ? (
                            <><Loader2 size={12} className="animate-spin" /> Setting up...</>
                          ) : (
                            <><Zap size={12} /> Setup FADV Submission</>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-rf-text-muted leading-tight mt-0.5">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
