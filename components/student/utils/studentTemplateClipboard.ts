export function createTemplateClipboardHtml(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

export function getPlainTextFromTemplateHtml(html: string): string {
  const documentFragment = new DOMParser().parseFromString(html, 'text/html');
  return documentFragment.body.innerText.replace(/\n{3,}/g, '\n\n').trim();
}

function copyHtmlWithLegacySelection(html: string): boolean {
  const container = document.createElement('div');
  container.contentEditable = 'true';
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.opacity = '0';
  container.innerHTML = html;
  document.body.appendChild(container);

  const selection = window.getSelection();
  const previousRanges: Range[] = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      previousRanges.push(selection.getRangeAt(index).cloneRange());
    }

    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const copied = document.execCommand('copy');
  if (selection) {
    selection.removeAllRanges();
    previousRanges.forEach((range) => selection.addRange(range));
  }

  container.remove();
  return copied;
}

export async function copyTemplateHtml(html: string): Promise<void> {
  const plainText = getPlainTextFromTemplateHtml(html);
  const clipboardHtml = createTemplateClipboardHtml(html);

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([clipboardHtml], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ]);
    return;
  }

  if (!copyHtmlWithLegacySelection(html)) {
    throw new Error('Rich clipboard copying is not supported in this browser.');
  }
}
