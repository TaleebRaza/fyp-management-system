import { cn } from "../shared/cn";
import type { CommonProps } from "../shared/types";

export const Card = ({ children, className = "" }: CommonProps) => (
  <div
    className={cn(
      "portal-card portal-motion-card p-5 sm:p-6 md:p-8 transition-colors duration-200",
      className
    )}
  >
    {children}
  </div>
);

// Compatibility export: existing dashboards still import GlassCard.
// Keep the name for now to avoid a risky multi-file rename.
export const GlassCard = ({
  children,
  className = "",
}: CommonProps & { isDarkMode?: boolean }) => (
  <Card className={className}>{children}</Card>
);
