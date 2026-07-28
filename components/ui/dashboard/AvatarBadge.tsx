import { cn } from "../shared/cn";

const getInitials = (name?: string) => {
  if (!name) return "FP";

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "FP";
};

export type AvatarBadgeProps = {
  name?: string;
  initials?: string;
  className?: string;
};

export const AvatarBadge = ({
  name,
  initials,
  className = "",
}: AvatarBadgeProps) => (
  <div
    className={cn(
      "portal-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-sm font-bold text-white",
      className
    )}
    aria-hidden="true"
  >
    {initials || getInitials(name)}
  </div>
);
