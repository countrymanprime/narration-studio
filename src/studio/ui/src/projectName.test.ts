import { describe, expect, it } from 'vitest';
import { projectNameError } from './projectName';

// The cases are the Go fixtures' project names (src/studio/desktop/internal/pathfixtures, `Names()`), which project.ValidateName is tested
// against, so a name the host takes is a name the UI takes and the reverse.
const CASES: Array<[string, string, boolean]> = [
  ['plain', 'My Book', true],
  ['spaces-inside', 'The   Long  Book', true],
  ['trailing-space-is-trimmed', 'My Book  ', true],
  ['trailing-dot', 'My Book.', false],
  ['trailing-dots', 'My Book...', false],
  ['trailing-dot-then-space', 'My Book. ', false],
  ['only-dots', '...', false],
  ['inner-dot', 'Vol. 2 - Part One', true],
  ['leading-dot', '.hidden', true],
  ['accented', 'Café Résumé', true],
  ['cjk', '朗読プロジェクト', true],
  ['emoji', 'Book 📚🎙️', true],
  ['rtl', 'كتاب עברית', true],
  ['empty', '', false],
  ['only-spaces', '   ', false],
  ['dot', '.', false],
  ['dot-dot', '..', false],
  ['dot-dot-segment', '..\\Other', false],
  ['forward-slash', 'a/b', false],
  ['back-slash', 'a\\b', false],
  ['drive-colon', 'C:Book', false],
  ['unc-ish', '\\\\server\\share', false],
  ['reserved', 'CON', false],
  ['reserved-lower-with-extension', 'nul.txt', false],
  ['reserved-with-space-before-extension', 'CON .txt', false],
  ['reserved-lookalike', 'CONSOLE', true],
  ['control-character', 'Book\x07', false],
  ['embedded-nul', 'Book\x00', false],
  ['wildcard', 'Book*', false],
  ['exactly-255-characters', 'a'.repeat(255), true],
  ['256-characters', 'a'.repeat(256), false],
  ['300-cjk-characters', '本'.repeat(300), false],
  // The issue's name (#2656).
  ['colon in the middle', 'Bad:name', false],
];

describe('projectNameError', () => {
  it.each(CASES)('%s', (_label, name, valid) => {
    expect(projectNameError(name) === null).toBe(valid);
  });

  it('says what the host says', () => {
    expect(projectNameError('Bad:name')).toBe('a project name cannot contain any of <>:"/\\|?*');
    expect(projectNameError('Book.')).toBe('a project name cannot end with a period');
    expect(projectNameError('con')).toBe('"con" is a reserved name and cannot be used');
    expect(projectNameError('')).toBe('a project name is required');
  });
});
