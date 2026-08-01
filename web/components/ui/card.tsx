import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("rounded-lg border border-neutral-200 bg-white shadow-sm", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col space-y-1.5 p-5", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.ComponentProps<"h3">) => (
  <h3 className={cn("font-semibold leading-none tracking-tight", className)} {...p} />
);
export const CardDescription = ({ className, ...p }: React.ComponentProps<"p">) => (
  <p className={cn("text-sm text-neutral-500", className)} {...p} />
);
export const CardContent = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("p-5 pt-0", className)} {...p} />
);
