import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// Estado codificado em forma e cor: quem não distingue as duas cores ainda lê
// a palavra, e o ponto à esquerda dá a diferença de forma.
const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-sealsoft text-seal",
        ok: "bg-oksoft text-ok",
        alert: "bg-denysoft text-deny",
        muted: "border border-hairline text-slate",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export const Badge = ({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badge>) => (
  <span className={cn(badge({ variant }), className)} {...props}>
    <span aria-hidden className="inline-block size-1.5 rounded-full bg-current opacity-70" />
    {children}
  </span>
);
