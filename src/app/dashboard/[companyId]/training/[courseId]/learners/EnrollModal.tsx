"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, Check, Mail, Loader2, UserPlus } from "lucide-react";
import {
  getUnenrolledApplicants,
  enrollApplicant,
  sendTrainingEmail,
} from "../../actions";

type Applicant = {
  id: string;
  full_name: string;
  email: string | null;
  jobs: { title: string } | null;
};
type View = "select" | "success";

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  courseId: string;
  courseName: string;
  hasGmail: boolean;
}

export function EnrollModal({
  open,
  onClose,
  companyId,
  courseId,
  courseName,
  hasGmail,
}: Props) {
  const [view, setView] = useState<View>("select");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Applicant | null>(null);
  const [enrolledToken, setEnrolledToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const appUrl =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Reset and load applicants when modal opens
  useEffect(() => {
    if (!open) return;
    setView("select");
    setSearch("");
    setSelected(null);
    setEnrolledToken(null);
    setCopied(false);
    setError(null);
    setEmailSent(false);
    setEmailError(null);

    setLoading(true);
    getUnenrolledApplicants(companyId, courseId)
      .then(setApplicants)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, companyId, courseId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return applicants;
    return applicants.filter(
      (a) =>
        a.full_name.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        a.jobs?.title.toLowerCase().includes(q)
    );
  }, [applicants, search]);

  function handleSelect(a: Applicant) {
    setSelected(a);
    setSearch(a.full_name);
  }

  function doEnroll(sendEmail: boolean) {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        const { token } = await enrollApplicant(companyId, courseId, selected.id);
        setEnrolledToken(token);
        setView("success");
        if (sendEmail) {
          const result = await sendTrainingEmail(companyId, selected.id, token);
          if (result.sent) {
            setEmailSent(true);
          } else {
            setEmailError(result.error ?? "Email failed");
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to enroll");
      }
    });
  }

  function copyLink() {
    if (!enrolledToken) return;
    navigator.clipboard.writeText(`${appUrl}/learn/${enrolledToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function enrollAnother() {
    setView("select");
    setSelected(null);
    setSearch("");
    setEnrolledToken(null);
    setEmailSent(false);
    setEmailError(null);
    setError(null);
    // Refresh list to remove the newly enrolled person
    setLoading(true);
    getUnenrolledApplicants(companyId, courseId)
      .then(setApplicants)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const canSubmit = !!selected && !isPending;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll Applicant</DialogTitle>
          <p className="text-sm text-stone-500 mt-0.5">{courseName}</p>
        </DialogHeader>

        {view === "select" && (
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Search input */}
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">
                Search applicants
              </label>
              <input
                type="text"
                placeholder="Name or email…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected(null);
                }}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                disabled={loading || isPending}
              />
            </div>

            {/* Applicant list */}
            <div className="max-h-52 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
              {loading ? (
                <div className="px-4 py-6 text-center text-sm text-stone-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-stone-400">
                  {applicants.length === 0
                    ? "All applicants are already enrolled"
                    : "No applicants match your search"}
                </div>
              ) : (
                filtered.slice(0, 60).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelect(a)}
                    className={`w-full px-4 py-2.5 text-left flex flex-col transition-colors
                                hover:bg-stone-50
                                ${selected?.id === a.id ? "bg-blue-50 hover:bg-blue-50" : ""}`}
                  >
                    <span className="text-sm font-medium text-stone-900">
                      {a.full_name}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {a.jobs?.title && (
                        <span className="text-xs text-stone-500 font-medium">
                          {a.jobs.title}
                        </span>
                      )}
                      {a.jobs?.title && a.email && (
                        <span className="text-xs text-stone-300">·</span>
                      )}
                      {a.email && (
                        <span className="text-xs text-stone-400">{a.email}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-1">
              {hasGmail ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => doEnroll(true)}
                    disabled={!canSubmit}
                    className="w-full justify-center"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enrolling…
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Enroll + Send Email
                      </>
                    )}
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={() => doEnroll(false)}
                    disabled={!canSubmit}
                    className="w-full justify-center"
                  >
                    Enroll & Copy Link
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => doEnroll(false)}
                    disabled={!canSubmit}
                    className="w-full justify-center"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enrolling…
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Enroll & Copy Link
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-stone-400 text-center">
                    Gmail not connected — copy and share the link manually.
                  </p>
                </>
              )}
              <Button
                variant="tertiary"
                onClick={onClose}
                disabled={isPending}
                className="w-full justify-center"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {view === "success" && (
          <div className="space-y-4">
            {/* Success banner */}
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  {selected?.full_name} enrolled
                </p>
                {isPending && !emailSent && !emailError && (
                  <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Sending email…
                  </p>
                )}
                {emailSent && (
                  <p className="text-xs text-green-700 mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    Training email sent to {selected?.email}
                  </p>
                )}
                {emailError && (
                  <p className="text-xs text-red-600 mt-0.5">
                    Email failed: {emailError}
                  </p>
                )}
              </div>
            </div>

            {/* Magic link copy */}
            <div>
              <p className="text-xs font-medium text-stone-600 mb-1.5">Training link</p>
              <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
                <span className="flex-1 text-xs text-stone-500 font-mono truncate">
                  {appUrl}/learn/{enrolledToken}
                </span>
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md
                             bg-stone-900 text-white hover:bg-stone-700 transition-colors flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="tertiary"
                onClick={onClose}
                className="flex-1 justify-center"
              >
                Done
              </Button>
              <Button
                variant="secondary"
                onClick={enrollAnother}
                className="flex-1 justify-center"
              >
                Enroll Another
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Trigger button (thin client wrapper for the Server Component page) ─────────

interface TriggerProps {
  companyId: string;
  courseId: string;
  courseName: string;
  hasGmail: boolean;
}

export function EnrollModalTrigger({
  companyId,
  courseId,
  courseName,
  hasGmail,
}: TriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2"
      >
        <UserPlus className="w-4 h-4" />
        Enroll Applicant
      </Button>

      <EnrollModal
        open={open}
        onClose={() => setOpen(false)}
        companyId={companyId}
        courseId={courseId}
        courseName={courseName}
        hasGmail={hasGmail}
      />
    </>
  );
}
