import { useState } from 'react';
import { SearchField } from '../../primitives/SearchField';
import { useScopedFields } from '../data/settingsForms';
import { KeyboardPanel } from '../KeyboardPanel';
import { useSettingsHost } from '../row/SettingsHost';

/**
 * Shortcuts: a find box over every command and its keys, with the working remapping beside each (Change, then press the key or pedal), Reset
 * and Reset all. The keys live in the computer's `Keymap.overrides`; each change saves at once.
 */
export function ShortcutsRowBody() {
  const { notify } = useSettingsHost();
  const { fields, reload } = useScopedFields('Keymap', 'global');
  const [find, setFind] = useState('');
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <SearchField label="Find a shortcut" placeholder="Find a shortcut" value={find} onChange={setFind} />
      {/* The list grows with the card: no frame or scroller of its own inside the row's card (alignment audit XSE1-3). */}
      <div role="region" aria-label="Shortcuts">
        <KeyboardPanel overridesField={fields?.find((field) => field.key === 'overrides')} notify={notify} reload={reload} find={find} />
      </div>
    </div>
  );
}
