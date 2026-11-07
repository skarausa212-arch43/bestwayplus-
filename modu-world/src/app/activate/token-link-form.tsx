"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Accepts a full tag URL or a bare token and opens the passport. */
export function TokenLinkForm({ labels }: { labels: { label: string; placeholder: string; open: string; invalid: string } }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const m = value.trim().match(/(?:\/t\/)?([A-Za-z0-9_-]{20,64})\/?$/);
        if (!m) return setError(true);
        router.push(`/t/${m[1]}`);
      }}
    >
      <label htmlFor="tag" className="label">
        {labels.label}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="tag"
          className="field"
          placeholder={labels.placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          aria-invalid={error}
        />
        <Button type="submit">
          {labels.open} <ArrowRight />
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {labels.invalid}
        </p>
      )}
    </form>
  );
}
