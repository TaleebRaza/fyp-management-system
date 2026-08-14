'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_SETTINGS } from '../../../config/appSettings';

type TimerHandle = ReturnType<typeof setInterval>;

const BROADCAST_MIME_TYPE = APP_SETTINGS.STUDENT_MESSAGE.AUDIO_CONTENT_TYPE;
const BROADCAST_AUDIO_BIT_RATE = 16_000;

export type AudioRecorderState = {
  audioBlob: Blob | null;
  audioUrl: string | null;
  clearAudio: () => void;
  isRecording: boolean;
  recordingTime: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
};

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<TimerHandle | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const recordingRequestRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);


  const replaceAudioUrl = useCallback((blob: Blob | null) => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    const nextAudioUrl = blob ? URL.createObjectURL(blob) : null;
    audioUrlRef.current = nextAudioUrl;
    if (mountedRef.current) {
      setAudioUrl(nextAudioUrl);
    }
  }, []);

  const stopRecording = useCallback(() => {
    recordingRequestRef.current += 1;
    clearTimer();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      stopStream();
    }

    if (mountedRef.current) {
      setIsRecording(false);
    }
  }, [clearTimer, stopStream]);

  const startRecording = useCallback(async () => {
    const requestId = recordingRequestRef.current + 1;
    recordingRequestRef.current = requestId;

    try {
      if (!MediaRecorder.isTypeSupported(BROADCAST_MIME_TYPE)) {
        alert('This browser does not support WebM audio recording.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (!mountedRef.current || recordingRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      clearTimer();
      stopStream();
      chunksRef.current = [];
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: BROADCAST_MIME_TYPE,
        audioBitsPerSecond: BROADCAST_AUDIO_BIT_RATE,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: BROADCAST_MIME_TYPE });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        stopStream();

        if (mountedRef.current) {
          setAudioBlob(blob);
          replaceAudioUrl(blob);
          setIsRecording(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((previous) => {
          if (previous >= APP_SETTINGS.STUDENT_MESSAGE.MAX_AUDIO_SECONDS - 1) {
            queueMicrotask(stopRecording);
            return APP_SETTINGS.STUDENT_MESSAGE.MAX_AUDIO_SECONDS;
          }
          return previous + 1;
        });
      }, 1000);
    } catch {
      clearTimer();
      stopStream();
      if (mountedRef.current) {
        setIsRecording(false);
      }
      alert('Microphone access denied or unavailable.');
    }
  }, [clearTimer, replaceAudioUrl, stopRecording, stopStream]);

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
    replaceAudioUrl(null);
  }, [replaceAudioUrl]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      recordingRequestRef.current += 1;
      clearTimer();

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      stopStream();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [clearTimer, stopStream]);

  return {
    audioBlob,
    audioUrl,
    clearAudio,
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
  };
}
