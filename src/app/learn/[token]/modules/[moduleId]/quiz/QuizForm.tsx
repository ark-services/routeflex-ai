"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

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

interface QuizResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  courseCompleted?: boolean;
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
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center space-y-4">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
            result.passed ? "bg-green-100" : "bg-red-100"
          }`}
        >
          {result.passed ? (
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          ) : (
            <XCircle className="w-8 h-8 text-red-500" />
          )}
        </div>

        <div>
          <p className="text-3xl font-bold text-stone-900">{result.score}%</p>
          <p className={`text-sm font-medium mt-1 ${result.passed ? "text-green-600" : "text-red-500"}`}>
            {result.passed ? "Passed!" : "Not quite — try again"}
          </p>
          <p className="text-sm text-stone-500 mt-1">
            {result.correct} of {result.total} correct
          </p>
        </div>

        {result.passed && result.courseCompleted && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800">
              🎉 You've completed the entire course!
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
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          )}
          <button
            onClick={() => router.push(`/learn/${token}`)}
            className="px-4 py-2 bg-stone-100 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-200 transition-colors"
          >
            {result.passed && result.courseCompleted ? "View Completion" : "Back to Course"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {questions.map((question, idx) => (
        <div key={question.id} className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-sm font-medium text-stone-900 mb-4">
            <span className="text-stone-400 mr-2">Q{idx + 1}.</span>
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
                      ? "border-blue-400 bg-blue-50"
                      : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
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
                    className="mt-0.5 w-4 h-4 text-blue-600 flex-shrink-0"
                  />
                  <span className="text-sm text-stone-700">
                    <span className="font-medium text-stone-500 mr-2 uppercase">{option.id}.</span>
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
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Quiz"}
        </button>
        {!allAnswered && (
          <p className="text-xs text-stone-400">
            Answer all {questions.length} questions to submit.
          </p>
        )}
      </div>
    </form>
  );
}
