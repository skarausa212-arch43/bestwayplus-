"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  const ru = typeof document !== "undefined" && document.documentElement.lang !== "en";
  return (
    <div className="container-x flex flex-col items-center py-24 text-center" role="alert">
      <AlertTriangle className="size-12 text-peach" />
      <h1 className="mt-6 text-3xl font-bold">{ru ? "Что-то пошло не так" : "Something went wrong"}</h1>
      <p className="mt-3 max-w-md text-cream/70">
        {ru ? "Мы уже знаем об ошибке. Попробуйте ещё раз." : "Please try again."} {error.digest && <span className="font-mono text-xs">({error.digest})</span>}
      </p>
      <Button className="mt-8" onClick={reset}>
        {ru ? "Повторить" : "Retry"}
      </Button>
    </div>
  );
}
