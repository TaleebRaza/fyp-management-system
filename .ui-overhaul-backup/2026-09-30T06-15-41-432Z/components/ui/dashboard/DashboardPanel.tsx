import { Card } from "../primitives/Card";
import { cn } from "../shared/cn";
import type { CommonProps } from "../shared/types";

export const DashboardPanel = ({
  children,
  className = "",
}: CommonProps) => (
  <Card className={cn("portal-panel p-5 sm:p-6", className)}>
    {children}
  </Card>
);
