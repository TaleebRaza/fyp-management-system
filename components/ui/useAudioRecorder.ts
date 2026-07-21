'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type AudioRecorderOptions = {
  onRecorded: (audio: Blob) => void | Promise<void>;
  onError?: () => void;
  audioBitsPerSecond?: number;
  maxSeconds?: number;
};

export function useAudioRecorder({ onRecorded, onError, audioBitsPerSecond, maxSeconds = 60 }: AudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRecordedRef = useRef(onRecorded);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
    onErrorRef.current = onError;
  }, [onError, onRecorded]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    recorder?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    clearTimer();
    setIsRecording(false);
  }, [clearTimer]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
        ...(audioBitsPerSecond ? { audioBitsPerSecond } : {}),
      });

      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void onRecordedRef.current(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((time) => {
          if (time >= maxSeconds - 1) {
            stopRecording();
            return maxSeconds;
          }
          return time + 1;
        });
      }, 1000);
    } catch {
      onErrorRef.current?.();
    }
  }, [audioBitsPerSecond, maxSeconds, stopRecording]);

  useEffect(() => stopRecording, [stopRecording]);

  return { isRecording, recordingTime, startRecording, stopRecording };
}
