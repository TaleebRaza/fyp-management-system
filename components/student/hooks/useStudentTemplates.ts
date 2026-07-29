'use client';

import { useCallback, useMemo, useState } from 'react';
import { getStudentTemplates } from '../api/studentDashboardApi';
import type { StudentDashboardProps, WordTemplate } from '../studentDashboardTypes';
import { copyTemplateHtml } from '../utils/studentTemplateClipboard';

type UseStudentTemplatesOptions = {
  currentStage: string;
  showDialog: StudentDashboardProps['showDialog'];
};

export function useStudentTemplates({
  currentStage,
  showDialog,
}: UseStudentTemplatesOptions) {
  const [cachedTemplates, setCachedTemplates] = useState<WordTemplate[]>([]);
  const [cachedTemplateStage, setCachedTemplateStage] = useState<string | null>(null);
  const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WordTemplate | null>(null);
  const [isCopyingTemplate, setIsCopyingTemplate] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const visibleTemplates = useMemo(
    () => (cachedTemplateStage === currentStage ? cachedTemplates : []),
    [cachedTemplateStage, cachedTemplates, currentStage]
  );

  const loadTemplates = useCallback(async () => {
    if (cachedTemplateStage === currentStage && cachedTemplates.length > 0) return;

    const requestedStage = currentStage;
    setIsFetchingTemplates(true);
    try {
      setCachedTemplates(await getStudentTemplates(requestedStage));
      setCachedTemplateStage(requestedStage);
    } catch (error) {
      console.error('Template fetch error:', error);
      showDialog({
        title: 'Templates unavailable',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load templates from the server.',
      });
    } finally {
      setIsFetchingTemplates(false);
    }
  }, [cachedTemplateStage, cachedTemplates.length, currentStage, showDialog]);

  const openTemplate = useCallback((template: WordTemplate) => {
    setIsCopied(false);
    setSelectedTemplate(template);
  }, []);

  const closeTemplateDialog = useCallback(() => {
    if (isCopyingTemplate) return;
    setSelectedTemplate(null);
    setIsCopied(false);
  }, [isCopyingTemplate]);

  const handleCopyTemplate = useCallback(async () => {
    if (!selectedTemplate || isCopyingTemplate) return;

    const html = selectedTemplate.content.trim();
    if (!html) {
      showDialog({
        title: 'Template is empty',
        message: 'This template has no content to copy.',
      });
      return;
    }

    setIsCopyingTemplate(true);
    try {
      await copyTemplateHtml(html);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1800);
    } catch (error) {
      console.error('Word template copy failed:', error);
      showDialog({
        title: 'Copy failed',
        message:
          error instanceof Error
            ? error.message
            : 'Your browser blocked clipboard access. Try again from a secure tab.',
      });
    } finally {
      setIsCopyingTemplate(false);
    }
  }, [isCopyingTemplate, selectedTemplate, showDialog]);

  const resetTemplates = useCallback(() => {
    setCachedTemplates([]);
    setCachedTemplateStage(null);
    setSelectedTemplate(null);
    setIsCopyingTemplate(false);
    setIsCopied(false);
  }, []);

  return {
    visibleTemplates,
    isFetchingTemplates,
    selectedTemplate,
    isCopyingTemplate,
    isCopied,
    loadTemplates,
    openTemplate,
    closeTemplateDialog,
    handleCopyTemplate,
    resetTemplates,
  };
}
