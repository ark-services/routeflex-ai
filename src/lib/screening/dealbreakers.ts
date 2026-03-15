/**
 * Evaluates dealbreaker conditions against screening responses.
 *
 * Dealbreaker condition shapes:
 *   yes_no:           { "answer": "yes" | "no" }
 *   multiple_choice:  { "answer": "<option_id>" }
 *   number:           { "operator": "lt" | "lte" | "gt" | "gte" | "eq", "value": <number> }
 *   short_text:       (no dealbreaker condition — never auto-fails)
 */

type DealBreakerCondition =
  | { answer: string }
  | { operator: "lt" | "lte" | "gt" | "gte" | "eq"; value: number };

type Question = {
  id: string;
  type: string;
  is_dealbreaker: boolean;
  dealbreaker_condition: DealBreakerCondition | null;
};

type Answer = {
  questionId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
};

export type DealBreakerResult = {
  questionId: string;
  failed: boolean;
};

export function evaluateDealbreakers(
  questions: Question[],
  answers: Answer[]
): DealBreakerResult[] {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  return questions
    .filter((q) => q.is_dealbreaker && q.dealbreaker_condition)
    .map((q) => {
      const answer = answerMap.get(q.id);
      const condition = q.dealbreaker_condition!;
      let failed = false;

      if ("answer" in condition) {
        // yes_no or multiple_choice: compare the selected answer value/id
        const selectedValue =
          q.type === "yes_no"
            ? answer?.valueBoolean != null
              ? answer.valueBoolean
                ? "yes"
                : "no"
              : (answer?.valueText ?? "")
            : (answer?.valueText ?? "");
        failed = selectedValue === condition.answer;
      } else if ("operator" in condition && "value" in condition) {
        // number: compare with operator
        const num = answer?.valueNumber ?? null;
        if (num !== null) {
          switch (condition.operator) {
            case "lt":  failed = num <  condition.value; break;
            case "lte": failed = num <= condition.value; break;
            case "gt":  failed = num >  condition.value; break;
            case "gte": failed = num >= condition.value; break;
            case "eq":  failed = num === condition.value; break;
          }
        }
      }

      return { questionId: q.id, failed };
    });
}
