// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { toastTexts } from '../../overlay/toastTesting';
import { MasteringChain } from './MasteringChain';

afterEach(cleanup);

describe('the mastering chain card', () => {
  it('tells a failed read as a toast, and the card draws no alert in the page (rule 7, #2632)', () => {
    render(<MasteringChain problem="the host did not answer" />);
    expect(toastTexts()).toEqual(['The mastering chain could not be read: the host did not answer']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('says nothing while the chain is read without a problem', () => {
    render(<MasteringChain />);
    expect(toastTexts()).toEqual([]);
  });
});
