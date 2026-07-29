// components/dashboards/BroadcastWidget.tsx
'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import {
  BroadcastDialog,
  BroadcastLauncher,
  useAudioRecorder,
  useBroadcastSubmit,
} from '../broadcast';
import type { BroadcastMode, BroadcastTheme } from '../broadcast';

type BroadcastWidgetProps = {
  isDarkMode: boolean;
  showDialog?: ShowDialog;
  theme?: BroadcastTheme;
};

const subscribeToClient = () => () => {};

export default function BroadcastWidget({
  isDarkMode,
  theme,
}: BroadcastWidgetProps) {
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<BroadcastMode>('text');
  const [textContent, setTextContent] = useState('');

  const {
    audioBlob,
    audioUrl,
    clearAudio,
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  const closeDialog = useCallback(() => {
    stopRecording();
    setIsOpen(false);
  }, [stopRecording]);

  const handleClearComplete = useCallback(() => {
    stopRecording();
    setIsOpen(false);
  }, [stopRecording]);

  const handlePublishComplete = useCallback(() => {
    stopRecording();
    setIsOpen(false);
    setTextContent('');
    clearAudio();
  }, [clearAudio, stopRecording]);

  const { clearActive, isSubmitting, publish, success } = useBroadcastSubmit({
    audioBlob,
    mode,
    onClearComplete: handleClearComplete,
    onPublishComplete: handlePublishComplete,
    textContent,
  });

  return (
    <>
      <BroadcastLauncher onOpen={() => setIsOpen(true)} theme={theme} />
      {mounted &&
        createPortal(
          <BroadcastDialog
            audioUrl={audioUrl}
            hasAudio={audioBlob !== null}
            isDarkMode={isDarkMode}
            isOpen={isOpen}
            isRecording={isRecording}
            isSubmitting={isSubmitting}
            mode={mode}
            onClearActive={clearActive}
            onClearAudio={clearAudio}
            onClose={closeDialog}
            onModeChange={setMode}
            onPublish={publish}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onTextChange={setTextContent}
            recordingTime={recordingTime}
            success={success}
            textContent={textContent}
            theme={theme}
          />,
          document.body,
        )}
    </>
  );
}

