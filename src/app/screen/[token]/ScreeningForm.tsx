"use client";

import { useState } from "react";

type QuestionOption = { id: string; label: string };

type ScreeningQuestion = {
  id: string;
  text: string;
  type: "multiple_choice" | "short_text" | "yes_no" | "number";
  options: QuestionOption[] | null;
  is_dealbreaker: boolean;
};

type Props = {
  submissionId: string;
  token: string;
  questions: ScreeningQuestion[];
};

type Answers = Record<string, string | number | boolean>;

export default function ScreeningForm({ submissionId, token, questions }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(questionId: string, value: string | number | boolean) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  const allAnswered = questions.every((q) => answers[q.id] !== undefined && answers[q.id] !== "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/screening/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, submissionId, answers }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Submission failed");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-2xl font-bold text-rf-text-primary mb-2">
          Thank you!
        </h2>
        <p className="text-rf-text-secondary">
          Your responses have been submitted. We&apos;ll be in touch soon.
        </p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <p className="text-rf-text-secondary text-center py-8">
        No questions have been configured for this screening.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {questions.map((question, index) => (
        <div
          key={question.id}
          className="bg-rf-surface-card border border-rf-border rounded-lg p-6"
        >
          <p className="text-sm text-rf-text-muted mb-2">Question {index + 1}</p>
          <p className="font-medium text-rf-text-primary mb-4">{question.text}</p>

          {question.type === "yes_no" && (
            <div className="flex gap-3">
              {(["Yes", "No"] as const).map((opt) => {
                const val = opt === "Yes" ? "yes" : "no";
                const selected = answers[question.id] === val;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAnswer(question.id, val)}
                    className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? "border-rf-blue bg-rf-blue/10 text-rf-blue"
                        : "border-rf-border bg-rf-surface-page text-rf-text-secondary hover:border-rf-blue/50"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {question.type === "multiple_choice" && question.options && (
            <div className="space-y-2">
              {question.options.map((opt) => {
                const selected = answers[question.id] === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAnswer(question.id, opt.id)}
                    className={`w-full text-left py-3 px-4 rounded-lg border text-sm transition-colors ${
                      selected
                        ? "border-rf-blue bg-rf-blue/10 text-rf-blue"
                        : "border-rf-border bg-rf-surface-page text-rf-text-secondary hover:border-rf-blue/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {question.type === "short_text" && (
            <textarea
              rows={3}
              value={(answers[question.id] as string) ?? ""}
              onChange={(e) => setAnswer(question.id, e.target.value)}
              placeholder="Your answer..."
              className="w-full px-3 py-2 rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue/50 resize-none"
            />
          )}

          {question.type === "number" && (
            <input
              type="number"
              value={(answers[question.id] as number) ?? ""}
              onChange={(e) =>
                setAnswer(
                  question.id,
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              placeholder="Enter a number"
              className="w-full px-3 py-2 rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
            />
          )}
        </div>
      ))}

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !allAnswered}
        className="w-full py-3 rounded-lg bg-rf-blue text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-rf-blue/90 transition-colors"
      >
        {submitting ? "Submitting..." : "Submit Questionnaire"}
      </button>
    </form>
  );
}
