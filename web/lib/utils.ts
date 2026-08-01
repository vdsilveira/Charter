import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const encurtar = (s: string, n = 8) =>
  s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-4)}` : s;
