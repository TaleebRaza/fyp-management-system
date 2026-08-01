export type DashboardQuote = {
  id: number;
  text: string;
  author: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const parseDashboardQuote = (value: unknown): DashboardQuote | null => {
  if (!isRecord(value)) return null;

  const { id, quote, author } = value;
  if (
    typeof id !== 'number' ||
    !Number.isInteger(id) ||
    typeof quote !== 'string' ||
    typeof author !== 'string'
  ) {
    return null;
  }

  const text = quote.trim();
  const attribution = author.trim();
  if (!text || text.length > 360 || !attribution || attribution.length > 120) {
    return null;
  }

  return { id, text, author: attribution };
};
