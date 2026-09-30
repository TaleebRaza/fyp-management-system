import { Card } from "../primitives/Card";
import { cn } from "../shared/cn";
import type { CommonProps } from "../shared/types";

export const DashboardPanel = ({ children, className = "" }: CommonProps) => (
  <Card className={cn("portal-panel p-4 sm:p-5", className)}>{children}</Card>
);
