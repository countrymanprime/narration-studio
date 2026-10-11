import type { ComponentType } from 'react';

/**
 * The sections a Settings category renders below its own panels. A feature adds its section here, from its own file,
 * and `Settings.tsx` renders whatever a category holds in order: no feature edits the page by hand. A section takes no
 * props; it reads what it needs through the api context, like any other panel.
 */
export type SettingsSection = { id: string; component: ComponentType; order: number };

const registry = new Map<string, Map<string, SettingsSection & { seq: number }>>();
let nextSeq = 0;

/** Registers `component` under `category` (a `SETTINGS_CATEGORIES` key). Registering an id again replaces that section. */
export function registerSettingsSection(category: string, id: string, component: ComponentType, order: number): void {
  const sections = registry.get(category) ?? new Map();
  sections.set(id, { id, component, order, seq: nextSeq++ });
  registry.set(category, sections);
}

/** A category's sections by `order`; equal orders keep registration order. A category with none gives an empty list. */
export function settingsSectionsFor(category: string): SettingsSection[] {
  const sections = [...(registry.get(category)?.values() ?? [])];
  return sections.sort((a, b) => a.order - b.order || a.seq - b.seq).map(({ id, component, order }) => ({ id, component, order }));
}
