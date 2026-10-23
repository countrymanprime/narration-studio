import { useCallback, useState } from 'react';
import { loadTextPrefs, saveTextPrefs, type TextPrefs } from './readerText';

/** The reader's text choices for this viewer: read from storage once, and saved on each change. */
export function useTextPrefs(): [TextPrefs, (change: Partial<TextPrefs>) => void] {
  const [prefs, setPrefs] = useState(loadTextPrefs);
  const change = useCallback((next: Partial<TextPrefs>) => {
    setPrefs((current) => {
      const merged = { ...current, ...next };
      saveTextPrefs(merged);
      return merged;
    });
  }, []);
  return [prefs, change];
}
