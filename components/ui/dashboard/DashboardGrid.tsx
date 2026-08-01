import type React from "react";
import { cn } from "../shared/cn";

export type DashboardGridProps = {
  children: React.ReactNode;
  className?: string;
  columns?: "auto" | "two" | "three";
};

const dashboardGridColumns: Record<
  NonNullable<DashboardGridProps["columns"]>,
  string
> = {
  auto: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
  two: "grid-cols-1 lg:grid-cols-2",
  three: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
};

export const DashboardGrid = ({
  children,
  className = "",
  columns = "auto",
}: DashboardGridProps) => (
  <div
    className={cn(
      "portal-grid grid gap-5 sm:gap-4",
      dashboardGridColumns[columns],
      className
    )}
  >
    {children}
  </div>
);
