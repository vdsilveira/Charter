import * as React from "react";
import { cn } from "@/lib/utils";

/** Ficha de registro: filete fino, sem sombra pesada. */
export const Card = ({ className, ...p }: React.ComponentProps<"section">) => (
  <section className={cn("rounded-lg border border-hairline bg-surface", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-1 border-b border-hairline px-5 py-4", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.ComponentProps<"h2">) => (
  <h2 className={cn("font-serif text-lg font-semibold leading-tight", className)} {...p} />
);
export const CardDescription = ({ className, ...p }: React.ComponentProps<"p">) => (
  <p className={cn("text-sm text-slate", className)} {...p} />
);
export const CardContent = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("px-5 py-4", className)} {...p} />
);
