import type React from "react";
import { cn } from "../shared/cn";
import type { IconComponent } from "../shared/types";

export type StyledInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: IconComponent;
  isDarkMode?: boolean;
  theme?: unknown;
  wrapperClassName?: string;
};

export const StyledInput = ({
  icon: Icon,
  disabled,
  value,
  className = "",
  wrapperClassName = "",
  ...props
}: StyledInputProps) => {
  const isControlled = value !== undefined || props.onChange !== undefined;

  return (
    <div className={cn("relative", wrapperClassName)}>
      {Icon && (
        <Icon
          aria-hidden
          size={18}
          className={cn(
            "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-soft)] transition-colors",
            disabled ? "opacity-40" : "peer-focus:text-[var(--color-primary)]"
          )}
        />
      )}
      <input
        disabled={disabled}
        className={cn(
          "peer portal-focus-lift h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)]",
          "focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]",
          "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:opacity-60",
          Icon ? "pl-10" : "",
          className
        )}
        {...props}
        {...(isControlled ? { value: value ?? "" } : {})}
      />
    </div>
  );
};
