import { describe, expect, it } from 'vitest';
import { registerSettingsSection, settingsSectionsFor } from './sections';

const A = () => null;
const B = () => null;
const C = () => null;

describe('settings section registry', () => {
  it('lists a category sections in order, whatever the registration order', () => {
    registerSettingsSection('order-test', 'late', B, 20);
    registerSettingsSection('order-test', 'early', A, 10);
    expect(settingsSectionsFor('order-test').map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('replaces a section registered twice with one id', () => {
    registerSettingsSection('replace-test', 'one', A, 10);
    registerSettingsSection('replace-test', 'one', C, 10);
    const sections = settingsSectionsFor('replace-test');
    expect(sections).toHaveLength(1);
    expect(sections[0].component).toBe(C);
  });

  it('breaks an order tie by registration order', () => {
    registerSettingsSection('tie-test', 'first', A, 5);
    registerSettingsSection('tie-test', 'second', B, 5);
    expect(settingsSectionsFor('tie-test').map((s) => s.id)).toEqual(['first', 'second']);
  });

  it('gives a category with no sections an empty list', () => {
    expect(settingsSectionsFor('none-registered')).toEqual([]);
  });
});
