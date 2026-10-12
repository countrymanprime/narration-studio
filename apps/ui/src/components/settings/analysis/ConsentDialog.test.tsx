// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsentDialog } from './ConsentDialog';
import { recommended } from './components';
import { ANALYSIS_TOOLS, createFakeTools } from './fixtures';
import { useAnalysisTools } from './useAnalysisTools';

afterEach(cleanup);

const tool = (id: string) => ANALYSIS_TOOLS.find((candidate) => candidate.id === id)!;

describe('ConsentDialog', () => {
  it('names one tool in its title, with its facts and licence, and focuses Download', () => {
    render(<ConsentDialog tools={[tool('gliner')]} cancel={vi.fn()} download={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Download GLiNER' });
    const facts = dialog.querySelector('[data-consent="gliner"]') as HTMLElement;
    expect(within(facts).getByRole('heading', { name: /GLiNER/ }).textContent).toContain('712 MB');
    expect(within(facts).getByText('Downloads from').nextElementSibling?.textContent).toBe('huggingface.co, files.pythonhosted.org');
    expect(within(facts).getByText('Needs').nextElementSibling?.textContent).toBe('about 2 GB of memory');
    expect(within(facts).getByText('Takes').nextElementSibling?.textContent).toBe('about 2 min per book');
    expect(within(facts).getByRole('link', { name: 'Apache-2.0' }).getAttribute('href')).toBe(tool('gliner').licenseUrl);
    expect(dialog.querySelector('[data-consent-total]')).toBeNull();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Download' }));
  });

  it('several-tools-in-one-consent: lists both and the total, and one Download hands both back', () => {
    const download = vi.fn();
    const pair = recommended(ANALYSIS_TOOLS);
    render(<ConsentDialog tools={pair} cancel={vi.fn()} download={download} />);
    const dialog = screen.getByRole('dialog', { name: 'Download better analysis' });
    expect(dialog.querySelector('[data-consent="gliner"]')).not.toBeNull();
    expect(dialog.querySelector('[data-consent="booknlp-small"]')).not.toBeNull();
    // 712 MB and 274 MB: the total is the bytes added up, not the rounded sizes.
    expect(dialog.querySelector('[data-consent-total]')!.textContent).toBe('Total download · 986 MB');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    expect(download).toHaveBeenCalledWith(['gliner', 'booknlp-small']);
  });

  it('Cancel and Escape download nothing', () => {
    const cancel = vi.fn();
    const download = vi.fn();
    render(<ConsentDialog tools={[tool('gliner')]} cancel={cancel} download={download} />);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(cancel).toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});

describe('useAnalysisTools', () => {
  it('starts several tools one after another through the one loop', async () => {
    const fake = createFakeTools();
    const install = vi.fn(fake.port.assetsInstall);
    const port = { ...fake.port, assetsInstall: install };
    const { result } = renderHook(() => useAnalysisTools(port));
    await waitFor(() => expect(result.current.tools).toHaveLength(4));
    act(() => result.current.install(['gliner', 'booknlp-small']));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    expect(install).toHaveBeenLastCalledWith('analysis', 'gliner');
    expect(result.current.statusFor(tool('booknlp-small'))).toBe('not-installed');
    await waitFor(() => expect(install).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(install).toHaveBeenLastCalledWith('analysis', 'booknlp-small');
    expect(fake.installed()).toEqual(['gliner']);
    await waitFor(() => expect(fake.installed()).toEqual(['gliner', 'booknlp-small']), { timeout: 4000 });
  });
});
