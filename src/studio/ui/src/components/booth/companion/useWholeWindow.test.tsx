// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useWholeWindow } from './useWholeWindow';

afterEach(cleanup);

function Companion() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useWholeWindow(root);
  return <div ref={setRoot} data-testid="companion" />;
}

describe('useWholeWindow', () => {
  it("makes the rest of the page inert and hidden, but leaves the toast region live so a message's Retry can be pressed", () => {
    const app = document.body.appendChild(document.createElement('div'));
    const toasts = document.body.appendChild(document.createElement('div'));
    toasts.setAttribute('data-toast-region', '');
    const { unmount } = render(<Companion />);
    expect(app.hasAttribute('inert')).toBe(true);
    expect(app.getAttribute('aria-hidden')).toBe('true');
    expect(toasts.hasAttribute('inert')).toBe(false);
    expect(toasts.hasAttribute('aria-hidden')).toBe(false);
    unmount();
    expect(app.hasAttribute('inert')).toBe(false);
    app.remove();
    toasts.remove();
  });
});
