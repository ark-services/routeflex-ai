"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Check, X } from "lucide-react";

interface Question {
  id: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
}

interface Props {
  token: string;
  enrollmentId: string;
  moduleId: string;
  passingThreshold: number;
  questions: Question[];
  isFinalExam: boolean;
}

interface ReviewItem {
  questionId: string;
  isCorrect: boolean;
  chosenOptionId: string;
  correctOptionId: string;
}

interface QuizResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  courseCompleted?: boolean;
  review: ReviewItem[];
}

export function QuizForm({
  token,
  enrollmentId,
  moduleId,
  passingThreshold,
  questions,
  isFinalExam,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = questions.every((q) => answers[q.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lms/submit-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          enrollmentId,
          moduleId,
          answers,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    // Build a lookup map so we can render question text + option text in review
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    return (
      <div className="space-y-5">
        {/* ── Score card ── */}
        <div className="bg-rf-surface-card border border-rf-border rounded-xl p-6 text-center space-y-4">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
              result.passed ? "bg-rf-success-bg" : "bg-red-100"
            }`}
          >
            {result.passed ? (
              <CheckCircle2 className="w-8 h-8 text-rf-success" />
            ) : (
              <XCircle className="w-8 h-8 text-rf-danger" />
            )}
          </div>

          <div>
            <p className="text-3xl font-bold text-rf-text-primary">{result.score}%</p>
            <p className={`text-sm font-medium mt-1 ${result.passed ? "text-rf-success" : "text-rf-danger"}`}>
              {result.passed ? "Passed!" : "Not quite — try again"}
            </p>
            <p className="text-sm text-rf-text-secondary mt-1">
              {result.correct} of {result.total} correct
            </p>
          </div>

          {result.passed && result.courseCompleted && (
            <div className="bg-rf-success-bg border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-rf-success">
                🎉 You&apos;ve completed the entire course!
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 justify-center pt-2">
            {!result.passed && (
              <button
                onClick={() => {
                  setResult(null);
                  setAnswers({});
                }}
                className="px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark transition-colors"
              >
                Try Again
              </button>
            )}
            <button
              onClick={() => router.push(`/learn/${token}`)}
              className="px-4 py-2 bg-rf-ink-100 text-rf-ink-700 text-sm font-medium rounded-lg hover:bg-rf-ink-100 transition-colors"
            >
              {result.passed && result.courseCompleted ? "View Completion" : "Back to Course"}
            </button>
          </div>
        </div>

        {/* ── Answer review ── */}
        {result.review && result.review.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-rf-ink-700 px-1">Answer Review</h2>

            {result.review.map((item, idx) => {
              const question = questionMap.get(item.questionId);
              if (!question) return null;

              return (
                <div
                  key={item.questionId}
                  className={`bg-rf-surface-card border rounded-xl p-5 ${
                    item.isCorrect ? "border-green-200" : "border-red-200"
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start gap-2.5 mb-4">
                    <div
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                        item.isCorrect ? "bg-rf-success-bg" : "bg-red-100"
                      }`}
                    >
                      {item.isCorrect ? (
                        <Check className="w-3 h-3 text-rf-success" />
                      ) : (
                        <X className="w-3 h-3 text-rf-danger" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-rf-text-primary leading-snug">
                      <span className="text-rf-text-muted mr-1.5">Q{idx + 1}.</span>
                      {question.question_text}
                    </p>
                  </div>

                  {/* Options */}
                  <div className="space-y-2 pl-7">
                    {question.options.map((option) => {
                      const isChosen = option.id === item.chosenOptionId;
                      const isCorrectAnswer = option.id === item.correctOptionId;

                      // Determine styling
                      let optionClass = "border-rf-ink-100 bg-rf-surface-page text-rf-text-secondary";
                      let badge: React.ReactNode = null;

                      if (isCorrectAnswer) {
                        optionClass = "border-green-200 bg-rf-success-bg text-rf-text-primary";
                        badge = (
                          <span className="ml-auto flex-shrink-0 text-xs font-medium text-rf-success bg-rf-success-bg px-2 py-0.5 rounded-full">
                            Correct answer
                          </span>
                        );
                      } else if (isChosen && !item.isCorrect) {
                        // They chose wrong
                        optionClass = "border-red-200 bg-rf-danger-bg text-rf-text-primary";
                        badge = (
                          <span className="ml-auto flex-shrink-0 text-xs font-medium text-rf-danger bg-red-100 px-2 py-0.5 rounded-full">
                            Your answer
                          </span>
                        );
                      }

                      return (
                        <div
                          key={option.id}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm ${optionClass}`}
                        >
                          <span className="font-medium uppercase flex-shrink-0">{option.id}.</span>
                          <span className="flex-1">{option.text}</span>
                          {badge}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-rf-danger-bg border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {questions.map((question, idx) => (
        <div key={question.id} className="bg-rf-surface-card border border-rf-border rounded-xl p-5">
          <p className="text-sm font-medium text-rf-text-primary mb-4">
            <span className="text-rf-text-muted mr-2">Q{idx + 1}.</span>
            {question.question_text}
          </p>
          <div className="space-y-2.5">
            {question.options.map((option) => {
              const selected = answers[question.id] === option.id;
              return (
                <label
                  key={option.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected
                      ? "border-rf-blue bg-rf-blue-tint"
                      : "border-rf-border hover:border-rf-ink-100 hover:bg-rf-surface-page"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={option.id}
                    checked={selected}
                    onChange={() =>
                      setAnswers((prev) => ({ ...prev, [question.id]: option.id }))
                    }
                    className="mt-0.5 w-4 h-4 text-rf-blue flex-shrink-0"
                  />
                  <span className="text-sm text-rf-ink-700">
                    <span className="font-medium text-rf-text-secondary mr-2 uppercase">{option.id}.</span>
                    {option.text}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={!allAnswered || submitting}
          className="px-6 py-2.5 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Quiz"}
        </button>
        {!allAnswered && (
          <p className="text-xs text-rf-text-muted">
            Answer all {questions.length} questions to submit.
          </p>
        )}
      </div>
    </form>
  );
}
