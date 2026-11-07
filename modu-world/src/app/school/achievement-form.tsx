"use client";

import { useActionState, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Upload } from "lucide-react";
import { SubmitButton, ActionMessage } from "@/components/ui/form";
import { submitAchievementAction } from "./actions";

type Kind = "grade" | "improvement" | "task" | "olympiad";

/** React Hook Form handles live UI state/validation; the server action re-validates everything. */
export function AchievementForm({
  childOptions,
  labels,
}: {
  childOptions: { id: string; name: string }[];
  labels: Record<string, string> & { kinds: Record<Kind, string> };
}) {
  const [state, action] = useActionState(submitAchievementAction, null);
  const [formKey, setFormKey] = useState(0);
  // clear the form after each successful submission
  useEffect(() => {
    if (state?.ok) setFormKey((k) => k + 1);
  }, [state]);
  const { register, watch, formState } = useForm<{ kind: Kind; currentValue: string; previousValue: string }>({
    defaultValues: { kind: "grade" },
    mode: "onChange",
  });
  const kind = watch("kind");
  const needsCurrent = kind === "grade" || kind === "improvement";

  return (
    <form action={action} key={formKey} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="childId">{labels.child}</label>
          <select id="childId" name="childId" className="field" required>
            {childOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="kind">{labels.kind}</label>
          <select id="kind" className="field" {...register("kind")}>
            {(Object.keys(labels.kinds) as Kind[]).map((k) => (
              <option key={k} value={k}>{labels.kinds[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="subject">{labels.subject}</label>
          <input id="subject" name="subject" required minLength={2} maxLength={40} placeholder={labels.subjectPlaceholder} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="period">{labels.period}</label>
          <input id="period" name="period" required minLength={2} maxLength={20} placeholder={labels.periodPlaceholder} className="field" />
        </div>
        {kind === "improvement" && (
          <div>
            <label className="label" htmlFor="previousValue">{labels.previous}</label>
            <input
              id="previousValue"
              type="number"
              min={0}
              max={10}
              step={0.1}
              required
              className="field"
              {...register("previousValue", { required: true, min: 0, max: 10 })}
            />
          </div>
        )}
        {needsCurrent && (
          <div>
            <label className="label" htmlFor="currentValue">{labels.current}</label>
            <input
              id="currentValue"
              type="number"
              min={0}
              max={10}
              step={0.1}
              required
              className="field"
              aria-invalid={!!formState.errors.currentValue}
              {...register("currentValue", { required: true, min: 0, max: 10 })}
            />
            <p className="mt-1 text-xs text-muted">{labels.scaleHint}</p>
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor="description">{labels.description} <span className="text-muted">({labels.optional})</span></label>
        <textarea id="description" name="description" maxLength={280} rows={2} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="evidence">{labels.evidence} <span className="text-muted">({labels.optional})</span></label>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-cream/70 hover:border-peach/50">
          <Upload className="size-4 text-peach" />
          <input id="evidence" name="evidence" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-xs file:hidden" />
        </label>
        <p className="mt-1 text-xs text-muted">{labels.evidenceHint}</p>
      </div>
      <ActionMessage state={state} />
      <SubmitButton>{labels.submit}</SubmitButton>
    </form>
  );
}
