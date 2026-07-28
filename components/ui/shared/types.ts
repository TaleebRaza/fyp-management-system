import type React from "react";

export type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

export type CommonProps = {
  className?: string;
  children?: React.ReactNode;
};
