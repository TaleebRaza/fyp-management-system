// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAudioRecorder } from '../components/ui/useAudioRecorder';

function RecorderHarness({ onRecorded }: { onRecorded: (audio: Blob) => void }) {
  const { isRecording, startRecording, stopRecording } = useAudioRecorder({ onRecorded });
  return <><span>{isRecording ? 'recording' : 'idle'}</span><button onClick={() => void startRecording()}>Start</button><button onClick={stopRecording}>Stop</button></>;
}

describe('useAudioRecorder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stops microphone tracks and returns the recorded audio', async () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    class MockMediaRecorder {
      state: RecordingState = 'inactive';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(readonly stream: MediaStream) {}
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['audio']) } as BlobEvent);
        this.onstop?.();
      }
    }

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const onRecorded = vi.fn();
    const { unmount } = render(<RecorderHarness onRecorded={onRecorded} />);

    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(screen.getByText('recording')).toBeTruthy());
    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith(expect.any(Blob)));
    expect(stopTrack).toHaveBeenCalledOnce();
    unmount();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
