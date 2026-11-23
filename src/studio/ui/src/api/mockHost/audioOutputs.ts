// The computer's audio outputs in mock mode. A browser lists outputs without names until the page has used a device, and a real output id is
// the webview's own, so the mock names two outputs and accepts any of them (`voicesamples/audioOutputs.ts` reads them as it reads the real list).

export const MOCK_AUDIO_OUTPUT_MODES = ['none', 'blank', 'long', 'refused'] as const;
export type MockAudioOutputMode = (typeof MOCK_AUDIO_OUTPUT_MODES)[number];

const SPEAKERS = [
  { id: 'mock-speakers', label: 'Speakers (Realtek)' },
  { id: 'mock-headphones', label: 'Headphones (Focusrite USB Audio)' },
];
const LONG = [
  { id: 'mock-long', label: 'Realtek High Definition Audio (Digital Output Optical S/PDIF) via USB Audio CODEC Hub, port 3' },
  { id: 'mock-rtl', label: 'مكبرات الصوت (USB) 🎧' },
];

/**
 * Replaces the webview's output listing and `setSinkId` for the whole page. `none` makes the listing itself fail (only the system default is offered, with a toast and Check again), `blank` lists two outputs the webview gives no names (WebView2 without a media permission: "Output 1", "Output 2"), `long` lists long, right-to-left
 * and emoji names, `refused` lists the two outputs and makes the audio system refuse every named one.
 */
export function installMockAudioOutputs(mode?: MockAudioOutputMode): void {
  if (typeof navigator === 'undefined' || typeof HTMLMediaElement === 'undefined') return;
  const outputs = mode === 'long' ? LONG : mode === 'blank' ? SPEAKERS.map(({ id }) => ({ id, label: '' })) : SPEAKERS;
  const devices = [
    { kind: 'audiooutput', deviceId: 'default', label: 'Default - Speakers (Realtek)', groupId: 'mock' },
    ...outputs.map(({ id, label }) => ({ kind: 'audiooutput', deviceId: id, label, groupId: 'mock' })),
    { kind: 'audioinput', deviceId: 'mock-mic', label: 'Microphone', groupId: 'mock' },
  ];
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: () => (mode === 'none' ? Promise.reject(new DOMException('Not allowed', 'NotAllowedError')) : Promise.resolve(devices)),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    writable: true,
    value: (id: string) => (mode === 'refused' && id !== '' ? Promise.reject(new DOMException('The output is busy', 'NotAllowedError')) : Promise.resolve()),
  });
}
