"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "./actions";

type Template = "fedex_pd" | "scratch";

interface OnboardingWizardProps {
  companyId: string;
  companyName: string;
  accountId: string;
}

export default function OnboardingWizard({
  companyId,
  companyName,
  accountId,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0=welcome, 1=company, 2=job, 3=launching
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);

  const [company, setCompany] = useState(companyName);
  const [jobTitle, setJobTitle] = useState("");
  const [template, setTemplate] = useState<Template>("fedex_pd");
  const [error, setError] = useState("");
  const [launchProgress, setLaunchProgress] = useState(0);

  const companyInputRef = useRef<HTMLInputElement>(null);
  const jobInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select inputs when stepping into them
  useEffect(() => {
    if (step === 1) {
      setTimeout(() => {
        companyInputRef.current?.focus();
        companyInputRef.current?.select();
      }, 350);
    }
    if (step === 2) {
      setTimeout(() => {
        jobInputRef.current?.focus();
      }, 350);
    }
  }, [step]);

  // Launch sequence
  useEffect(() => {
    if (step !== 3) return;

    let cancelled = false;

    // Animate progress bar
    const interval = setInterval(() => {
      setLaunchProgress((p) => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + Math.random() * 15 + 5;
      });
    }, 300);

    (async () => {
      try {
        const result = await completeOnboarding({
          companyId,
          accountId,
          companyName: company,
          jobTitle,
          jobTemplate: template,
        });

        if (cancelled) return;

        if (result.success && result.redirectUrl) {
          setLaunchProgress(100);
          setTimeout(() => router.push(result.redirectUrl!), 400);
        } else {
          setError(result.error || "Something went wrong");
          clearInterval(interval);
          goTo(2); // Back to job step
        }
      } catch {
        if (cancelled) return;
        setError("Something went wrong. Please try again.");
        clearInterval(interval);
        goTo(2);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const goTo = useCallback(
    (target: number) => {
      if (animating) return;
      setDirection(target > step ? "forward" : "back");
      setAnimating(true);
      setTimeout(() => {
        setStep(target);
        setAnimating(false);
      }, 50);
    },
    [step, animating]
  );

  const next = () => goTo(step + 1);
  const back = () => goTo(step - 1);

  const progressWidth =
    step === 0 ? 0 : step === 1 ? 33.3 : step === 2 ? 66.6 : 100;

  const canContinue =
    step === 0
      ? true
      : step === 1
        ? company.trim().length > 0
        : step === 2
          ? jobTitle.trim().length > 0
          : false;

  return (
    <div className="fixed inset-0 bg-rf-surface-page flex flex-col">
      {/* Progress bar */}
      <div className="h-1 w-full bg-rf-ink-100/50">
        <div
          className="h-full bg-rf-blue transition-all duration-500 ease-out"
          style={{ width: `${progressWidth}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-lg">
          {/* Step indicator */}
          {step > 0 && step < 3 && (
            <div className="text-center mb-2">
              <span
                className="text-xs font-semibold tracking-widest uppercase text-rf-text-muted"
                style={{ letterSpacing: "0.12em" }}
              >
                Step {step} of 3
              </span>
            </div>
          )}

          {/* Step content with fade animation */}
          <div
            key={step}
            className="animate-[onboardFadeIn_0.4s_ease_both]"
          >
            {step === 0 && <WelcomeStep onNext={next} />}
            {step === 1 && (
              <CompanyStep
                value={company}
                onChange={setCompany}
                inputRef={companyInputRef}
                onNext={next}
                canContinue={canContinue}
              />
            )}
            {step === 2 && (
              <JobStep
                title={jobTitle}
                onTitleChange={setJobTitle}
                template={template}
                onTemplateChange={setTemplate}
                inputRef={jobInputRef}
                onNext={next}
                canContinue={canContinue}
                error={error}
              />
            )}
            {step === 3 && <LaunchingStep progress={launchProgress} />}
          </div>

          {/* Back button */}
          {step > 0 && step < 3 && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={back}
                className="text-sm font-medium text-rf-text-muted hover:text-rf-text-secondary transition-colors"
              >
                <svg
                  className="inline-block w-4 h-4 mr-1 -mt-px"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 12L6 8L10 4" />
                </svg>
                Back
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes onboardFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes onboardSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes onboardPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─── Welcome Step ─── */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div className="flex justify-center">
        <RouteFlexLogo size="large" />
      </div>
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-rf-text-primary">
          Welcome to RouteFlex
        </h1>
        <p className="text-lg text-rf-text-secondary">
          Set up your workspace in under a minute.
        </p>
      </div>
      <Button variant="primary" onClick={onNext} className="px-8 py-3 text-base">
        Get Started
      </Button>
    </div>
  );
}

/* ─── Company Name Step ─── */

function CompanyStep({
  value,
  onChange,
  inputRef,
  onNext,
  canContinue,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onNext: () => void;
  canContinue: boolean;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-rf-text-primary">
          What&apos;s your company called?
        </h1>
        <p className="text-rf-text-secondary">
          You can always change this later in settings.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue) onNext();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. FedEx Ground — Chicago"
          className="w-full rounded-rf-md border border-rf-ink-100 bg-rf-surface-card px-3 py-3 text-lg text-rf-text-primary placeholder:text-rf-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 text-center"
        />
        <div className="mt-6 flex justify-center">
          <Button
            type="submit"
            variant="primary"
            disabled={!canContinue}
            className="px-8 py-3 text-base"
          >
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ─── Job Step ─── */

function JobStep({
  title,
  onTitleChange,
  template,
  onTemplateChange,
  inputRef,
  onNext,
  canContinue,
  error,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  template: Template;
  onTemplateChange: (v: Template) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onNext: () => void;
  canContinue: boolean;
  error: string;
}) {
  const templates: {
    value: Template;
    label: string;
    description: string;
    stages?: string[];
  }[] = [
    {
      value: "fedex_pd",
      label: "FedEx P&D",
      description:
        "Pre-built pipeline for FedEx pickup & delivery hiring",
      stages: ["New Applicants", "Background Check", "Interview", "HR Paperwork"],
    },
    {
      value: "scratch",
      label: "Start from Scratch",
      description: "A blank board you can customize however you want",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-rf-text-primary">
          Create your first job posting
        </h1>
        <p className="text-rf-text-secondary">
          What position are you hiring for?
        </p>
      </div>

      {error && (
        <div className="bg-rf-danger-bg border border-red-200 text-rf-danger px-4 py-3 rounded-rf-md text-sm text-center">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Package Delivery Driver"
          className="w-full rounded-rf-md border border-rf-ink-100 bg-rf-surface-card px-3 py-3 text-lg text-rf-text-primary placeholder:text-rf-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 text-center"
        />

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-rf-text-secondary text-center">
            Choose a template
          </label>
          <div className="grid grid-cols-2 gap-3">
            {templates.map((t) => {
              const selected = template === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onTemplateChange(t.value)}
                  className={`relative text-left p-4 rounded-rf-lg border-2 transition-all ${
                    selected
                      ? "border-rf-blue bg-rf-blue-tint"
                      : "border-rf-ink-100 bg-rf-surface-card hover:border-rf-ink-300"
                  }`}
                >
                  {/* Radio indicator */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        selected ? "border-rf-blue" : "border-rf-ink-300"
                      }`}
                    >
                      {selected && (
                        <div className="w-2 h-2 rounded-full bg-rf-blue" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-semibold ${
                          selected ? "text-rf-blue" : "text-rf-text-primary"
                        }`}
                      >
                        {t.label}
                      </div>
                      <div className="text-xs text-rf-text-muted mt-1 leading-relaxed">
                        {t.description}
                      </div>
                      {t.stages && selected && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {t.stages.map((s) => (
                            <span
                              key={s}
                              className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-rf-sm bg-rf-blue/10 text-rf-blue"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center">
          <Button
            type="button"
            variant="primary"
            disabled={!canContinue}
            onClick={onNext}
            className="px-8 py-3 text-base"
          >
            Launch Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Launching Step ─── */

function LaunchingStep({ progress }: { progress: number }) {
  return (
    <div className="text-center space-y-8">
      {/* Spinner */}
      <div className="flex justify-center">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16" style={{ animation: "onboardSpin 1s linear infinite" }} viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="var(--rf-ink-100)"
              strokeWidth="4"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="var(--rf-blue)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="120 56"
            />
          </svg>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-rf-text-primary">
          Setting up your workspace
        </h2>
        <p
          className="text-rf-text-muted text-sm"
          style={{ animation: "onboardPulse 2s ease-in-out infinite" }}
        >
          Creating your board, forms, and pipeline...
        </p>
      </div>

      {/* Progress bar */}
      <div className="max-w-xs mx-auto">
        <div className="h-1.5 bg-rf-ink-100/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-rf-blue rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
