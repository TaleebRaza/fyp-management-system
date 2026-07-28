'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearBrowserDraft,
  clearBrowserFileDraft,
  readBrowserDraft,
  readBrowserFileDraft,
  writeBrowserDraft,
  writeBrowserFileDraft,
} from '../../../lib/browserDraftStorage';
import {
  EMPTY_STUDENT_PROJECT_DRAFT,
  getStudentProjectDraftKey,
  getStudentProjectFileDraftKey,
  hasStudentProjectDraftChanges,
  type StudentProjectDraft,
} from '../draft/studentProjectDraft';

const DRAFT_SAVE_DELAY_MS = 300;

export function useStudentProjectDraft(userId: string) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [legacyDomain, setLegacyDomain] = useState('');
  const [tools, setTools] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [baseline, setBaseline] = useState<StudentProjectDraft | null>(null);
  const [isReady, setIsReady] = useState(false);

  const draftKey = useMemo(
    () => (userId ? getStudentProjectDraftKey(userId) : ''),
    [userId]
  );
  const fileDraftKey = useMemo(
    () => (userId ? getStudentProjectFileDraftKey(userId) : ''),
    [userId]
  );

  const applyDraft = useCallback((draft: StudentProjectDraft) => {
    setTitle(draft.title);
    setDesc(draft.desc);
    setSelectedDomains(draft.selectedDomains);
    setLegacyDomain(draft.legacyDomain);
    setTools(draft.tools);
  }, []);

  const restoreProjectDraft = useCallback(
    async (serverDraft: StudentProjectDraft) => {
      if (!draftKey || !fileDraftKey) return;

      const savedDraft = readBrowserDraft<StudentProjectDraft>(draftKey);
      setBaseline(serverDraft);
      applyDraft(savedDraft || serverDraft);

      try {
        setFile(await readBrowserFileDraft(fileDraftKey));
      } catch (error) {
        console.warn('Unable to restore the selected project PDF:', error);
        setFile(null);
      }
      setIsReady(true);
    },
    [applyDraft, draftKey, fileDraftKey]
  );

  useEffect(() => {
    if (!draftKey || !isReady) return;

    const currentDraft: StudentProjectDraft = {
      title,
      desc,
      selectedDomains,
      legacyDomain,
      tools,
    };
    const saveTimer = window.setTimeout(() => {
      if (!hasStudentProjectDraftChanges(currentDraft, baseline)) {
        clearBrowserDraft(draftKey);
        return;
      }
      writeBrowserDraft(draftKey, currentDraft);
    }, DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(saveTimer);
  }, [baseline, desc, draftKey, isReady, legacyDomain, selectedDomains, title, tools]);

  const handleDomainsChange = useCallback((domains: string[]) => {
    setSelectedDomains(domains);
    if (domains.length > 0) setLegacyDomain('');
  }, []);

  const handleProjectFileChange = useCallback(
    async (nextFile: File | null) => {
      setFile(nextFile);
      if (!fileDraftKey) return;

      try {
        if (nextFile) {
          await writeBrowserFileDraft(fileDraftKey, nextFile);
        } else {
          await clearBrowserFileDraft(fileDraftKey);
        }
      } catch (error) {
        console.warn('Unable to save the selected project PDF in this browser:', error);
      }
    },
    [fileDraftKey]
  );

  const clearStoredProjectDraft = useCallback(async () => {
    if (draftKey) clearBrowserDraft(draftKey);
    if (fileDraftKey) await clearBrowserFileDraft(fileDraftKey);
    setFile(null);
  }, [draftKey, fileDraftKey]);

  const resetProjectDraft = useCallback(async () => {
    await clearStoredProjectDraft();
    applyDraft(EMPTY_STUDENT_PROJECT_DRAFT);
    setBaseline(null);
    setIsReady(false);
  }, [applyDraft, clearStoredProjectDraft]);

  return {
    title,
    setTitle,
    desc,
    setDesc,
    selectedDomains,
    legacyDomain,
    tools,
    setTools,
    file,
    restoreProjectDraft,
    handleDomainsChange,
    handleProjectFileChange,
    clearStoredProjectDraft,
    resetProjectDraft,
  };
}
