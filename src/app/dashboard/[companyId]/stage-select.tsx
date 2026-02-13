"use client";

import { useRef } from "react";
import { STAGES } from "@/lib/types";
import type { Stage } from "@/lib/types";

export function StageSelect({
  companyId,
  candidateId,
  currentStage,
  action,
}: {
  companyId: string;
  candidateId: string;
  currentStage: Stage;
  action: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={action} ref={formRef} className="inline">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="candidateId" value={candidateId} />
      <select
        name="stage"
        defaultValue={currentStage}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded border px-2 py-1 text-sm bg-transparent"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
