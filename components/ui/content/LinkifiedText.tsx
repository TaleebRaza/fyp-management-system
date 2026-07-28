import React from "react";

const trimTrailingUrlPunctuation = (value: string) => {
  const match = value.match(/[.,!?;:)\]}]+$/);

  if (!match) {
    return { url: value, trailing: "" };
  }

  return {
    url: value.slice(0, -match[0].length),
    trailing: match[0],
  };
};

const getSafeHref = (value: string) => {
  const trimmedValue = value.trim();
  const normalizedValue = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const url = new URL(normalizedValue);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
};

export type LinkifiedTextProps = {
  text: string;
  className?: string;
};

export const LinkifiedText = ({
  text,
  className = "",
}: LinkifiedTextProps) => {
  const source = String(text || "");
  const parts: React.ReactNode[] = [];
  const urlPattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  let lastIndex = 0;

  source.replace(urlPattern, (match, _unused, offset) => {
    if (offset > lastIndex) {
      parts.push(source.slice(lastIndex, offset));
    }

    const { url, trailing } = trimTrailingUrlPunctuation(match);
    const href = getSafeHref(url);

    if (href) {
      parts.push(
        <a
          key={`${href}-${offset}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-[var(--color-accent)] underline decoration-[var(--color-accent)]/40 underline-offset-4 transition-colors hover:text-[var(--color-accent-hover)]"
          onClick={(event) => event.stopPropagation()}
        >
          {url}
        </a>
      );
    } else {
      parts.push(match);
    }

    if (trailing) {
      parts.push(trailing);
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex));
  }

  return <span className={className}>{parts.length > 0 ? parts : source}</span>;
};
