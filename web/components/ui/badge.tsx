import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-neutral-100 text-neutral-800",
      ok: "bg-emerald-50 text-emerald-700",
      alert: "bg-red-50 text-red-700",
      muted: "bg-amber-50 text-amber-800",
    },
  },
  defaultVariants: { variant: "default" },
});

export const Badge = ({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badge>) => (
  <span className={cn(badge({ variant }), className)} {...props} />
);
