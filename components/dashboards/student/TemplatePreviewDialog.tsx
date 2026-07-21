import { CheckCircle, Copy, Loader2 } from 'lucide-react';

import { Button, Dialog } from '../../ui/SharedUI';
import { type WordTemplate } from './TemplateResourcesPanel';

type TemplatePreviewDialogProps = {
  template: WordTemplate | null;
  isCopying: boolean;
  isCopied: boolean;
  onClose: () => void;
  onCopy: () => void;
};

export function TemplatePreviewDialog({
  template,
  isCopying,
  isCopied,
  onClose,
  onCopy,
}: TemplatePreviewDialogProps) {
  return (
    <Dialog
      open={!!template}
      onClose={onClose}
      title={template?.title || 'Template'}
      description="Word preview · editable after pasting"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isCopying}>Close</Button>
          <Button onClick={onCopy} disabled={isCopying}>
            {isCopying ? <Loader2 className="animate-spin" size={16} /> : isCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
            {isCopying ? 'Copying' : isCopied ? 'Copied for Word' : 'Copy for Word'}
          </Button>
        </>
      }
    >
      <div className="portal-scrollbar max-h-[68vh] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 sm:p-5">
        <div
          role="document"
          aria-label={`${template?.title || 'Template'} Word preview`}
          className="mx-auto min-h-[720px] w-full max-w-[816px] bg-white px-6 py-10 text-black shadow-sm sm:px-10 md:px-16"
          // Trusted, allowlisted static HTML from word_templates/. Never use this for user HTML.
          dangerouslySetInnerHTML={{ __html: template?.content || '' }}
        />
      </div>
    </Dialog>
  );
}
