// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetFacts, formatSize, sizeLine } from './AssetFacts';
import { brand } from '../../brand.gen';

afterEach(cleanup);

const facts = {
  label: 'Language model',
  name: 'English, small (fast)',
  version: '3.8.0',
  publisher: 'Explosion',
  license: 'MIT',
  licenseUrl: 'https://spacy.io/models/en#en_core_web_sm',
  modelCardUrl: 'https://github.com/explosion/spacy-models/releases/tag/en_core_web_sm-3.8.0',
  provenanceUrl: 'https://github.com/explosion/spacy-models/releases/tag/en_core_web_sm-3.8.0',
  downloadSize: 12_806_118,
  diskSize: 15_251_718,
  installPath: `C:/Users/narrator/AppData/Local/${brand.identity.dataFolder}/assets/spacy/en_core_web_sm/3.8.0`,
};

describe('formatSize', () => {
  it('says whole megabytes below a gigabyte and one decimal of a gigabyte above', () => {
    expect(formatSize(12_806_118)).toBe('12 MB');
    expect(formatSize(400_658_291)).toBe('382 MB');
    expect(formatSize(3_087_284_237)).toBe('2.9 GB');
    expect(formatSize(100)).toBe('1 MB');
  });
});

describe('AssetFacts', () => {
  it('states what is downloaded, how much disk it needs, where it goes, its version and who publishes it', () => {
    render(<AssetFacts {...facts} />);
    expect(screen.getByText('English, small (fast)')).toBeTruthy();
    expect(screen.getByText('Version').nextElementSibling!.textContent).toBe('3.8.0');
    expect(screen.getByText('Explosion')).toBeTruthy();
    expect(screen.getByText('12 MB download, 15 MB on disk')).toBeTruthy();
    expect(screen.getByText('Saved to').nextElementSibling!.textContent).toBe(facts.installPath);
  });

  it('says one size when the download is what it takes on disk (R3PR2-23)', () => {
    expect(sizeLine(486_539_264, 486_539_264)).toBe('464 MB');
    expect(sizeLine(12_806_118, 15_251_718)).toBe('12 MB download, 15 MB on disk');
    render(<AssetFacts {...facts} diskSize={facts.downloadSize} />);
    expect(screen.getAllByText('12 MB')).toHaveLength(1);
    expect(screen.queryByText(/Disk needed/)).toBeNull();
  });

  it('lays labels and values on one two-column grid, so every value starts at one x (XPR2-30, R3BO-4, R3SB2-16)', () => {
    const { container } = render(<AssetFacts {...facts} />);
    const list = container.querySelector('dl')!;
    expect(list.className).toContain('grid');
    expect(list.className).toContain('grid-cols-[max-content_minmax(0,1fr)]');
    for (const group of Array.from(list.children)) expect(group.className).toContain('contents');
    for (const term of Array.from(list.querySelectorAll('dt'))) expect(term.textContent).not.toMatch(/:\s*$/);
  });

  it('breaks the path after a folder separator, never inside a folder name (R3BO-4)', () => {
    render(<AssetFacts {...facts} />);
    const path = screen.getByText('Saved to').nextElementSibling!;
    expect(path.innerHTML).not.toContain('break-all');
    expect(path.querySelectorAll('wbr').length).toBe(facts.installPath.split('/').length);
  });

  it('links the licence, the model card and where it came from, drawn as links', () => {
    render(<AssetFacts {...facts} />);
    for (const name of ['MIT', 'Model card', 'Provenance']) expect(screen.getByRole('link', { name }).className).toContain('underline');
    expect(screen.getByRole('link', { name: 'MIT' }).getAttribute('href')).toBe(facts.licenseUrl);
    expect(screen.getByRole('link', { name: 'Model card' }).getAttribute('href')).toBe(facts.modelCardUrl);
    expect(screen.getByRole('link', { name: 'Provenance' }).getAttribute('href')).toBe(facts.provenanceUrl);
  });

  it('holds only term and definition groups in the definition list', () => {
    const { container } = render(<AssetFacts {...facts} />);
    const list = container.querySelector('dl');
    for (const child of Array.from(list?.children ?? [])) {
      expect(child.tagName).toBe('DIV');
      expect(child.querySelector('dt')).not.toBeNull();
      expect(child.querySelector('dd')).not.toBeNull();
    }
  });
});
