// What a path no page owns shows: the shell, a message and a way out, in place of an empty page body (the router's "no routes matched").

import { useNavigate } from 'react-router-dom';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Heading title="Page not found" />
      <Panel title="This address does not open a page">
        <p role="alert" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The app has no page at this address. It may be an old link, or it may have been mistyped.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={() => navigate('/', { replace: true })}>
            Go to Production
          </Button>
        </div>
      </Panel>
    </div>
  );
}
