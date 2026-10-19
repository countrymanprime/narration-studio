import { useState } from 'react';
import { playTakeTone, readStoredTakeTone, writeStoredTakeTone } from '../../booth/takeTone';
import { RadioGroup } from '../../primitives/RadioGroup';

const OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
];

/** Start tone: a short beep before a Booth take starts, kept by this browser window. Turning it on plays it once, so it can be heard. */
export function TakeToneRowBody() {
  const [on, setOn] = useState(readStoredTakeTone);
  const choose = (next: string) => {
    const value = next === 'on';
    writeStoredTakeTone(value);
    setOn(value);
    if (value) void playTakeTone();
  };
  return <RadioGroup label="Start tone" value={on ? 'on' : 'off'} onChange={choose} options={OPTIONS} />;
}
