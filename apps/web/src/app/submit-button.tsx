"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pending = "Сохраняем…",
  className = "button primary",
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
}) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={isPending}>
      {isPending ? pending : children}
    </button>
  );
}
