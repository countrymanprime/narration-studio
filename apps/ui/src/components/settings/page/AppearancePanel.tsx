import { useTheme } from '../../../theme/ThemeContext';
import type { ThemePreference } from '../../../theme/theme';
import { Panel } from '../../primitives/Panel';
import { RadioGroup } from '../../primitives/RadioGroup';

// The mock's order and wording (`pages/Settings.tsx`, Appearance).
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match my system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** The mock's "Appearance" panel: three theme radios. Takes props only. */
export function AppearanceView({ value, onChange }: { value: ThemePreference; onChange: (next: ThemePreference) => void }) {
  return (
    <Panel title="Appearance">
      <RadioGroup label="Theme" value={value} onChange={onChange} options={THEME_OPTIONS} />
    </Panel>
  );
}

/** Settings > Appearance: the theme choice, saved through `useTheme` the one app-wide theme setting. */
export function AppearancePanel() {
  const { preference, setPreference } = useTheme();
  return <AppearanceView value={preference} onChange={setPreference} />;
}
