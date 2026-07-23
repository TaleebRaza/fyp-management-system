export function escapeHtml(value: unknown) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] || character));
}

export function normalizeText(value: unknown, maximumLength: number) {
  return String(value || '').trim().slice(0, maximumLength);
}
