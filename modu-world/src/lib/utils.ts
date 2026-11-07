import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ActionState = { ok: boolean; message?: string; error?: string; data?: Record<string, unknown> } | null;
