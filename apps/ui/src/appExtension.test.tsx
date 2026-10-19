// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { appExtension, ExtensionBanner, registerAppExtension, resetAppExtension } from './appExtension';

afterEach(resetAppExtension);

describe('the app extension seam', () => {
  it('registers nothing by default, so the Wails build and every mock build behave as before', () => {
    expect(appExtension()).toEqual({});
    const { container } = render(<ExtensionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('draws the registered banner, and nothing again once the extension is cleared', () => {
    registerAppExtension({ Banner: () => <div role="note">Demo</div> });
    const { container, rerender } = render(<ExtensionBanner />);
    expect(container.textContent).toBe('Demo');
    resetAppExtension();
    rerender(<ExtensionBanner />);
    expect(container.firstChild).toBeNull();
  });
});
