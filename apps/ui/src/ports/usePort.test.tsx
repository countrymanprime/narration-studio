// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import type { FindingsApi, ProductionApi } from './index';
import { usePort } from './usePort';

const read = (path: string): ts.SourceFile => ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);

function extendsList(file: ts.SourceFile): string[] {
  const facade = file.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'NarrationApi');
  return (facade?.heritageClauses ?? []).flatMap((c) => c.types.map((t) => t.expression.getText(file))).sort();
}

function mappedInterfaces(file: ts.SourceFile): string[] {
  const map = file.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'PortMap');
  return (map?.members ?? []).map((m) => (ts.isPropertySignature(m) && m.type ? m.type.getText(file) : '')).sort();
}

describe('ports index', () => {
  it('port-map-covers-every-domain-interface: PortMap maps exactly the interfaces NarrationApi extends', () => {
    const facade = extendsList(read('../types.ts'));
    expect(facade.length).toBeGreaterThan(0);
    expect(mappedInterfaces(read('./index.ts'))).toEqual(facade);
  });
});

describe('usePort', () => {
  it('use-port-returns-only-the-declared-interface: is typed as the one domain and returns the provider api', () => {
    const api = createMockApi();
    let got: unknown;
    function Probe() {
      const production = usePort('production');
      expectTypeOf(production).toEqualTypeOf<ProductionApi>();
      // @ts-expect-error findingsSummary belongs to FindingsApi, not ProductionApi.
      void production.findingsSummary;
      got = production;
      return null;
    }
    render(
      <ApiProvider api={api}>
        <Probe />
      </ApiProvider>,
    );
    expect(got).toBe(api);
  });

  it('use-port-outside-a-provider-throws: names usePort', () => {
    function Bare() {
      let message = '';
      try {
        usePort('findings');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      return <div>{message}</div>;
    }
    render(<Bare />);
    expect(screen.getByText("usePort('findings') called outside an <ApiProvider>.")).toBeTruthy();
  });

  it('use-port-follows-the-provider: a second api reaches the new one', () => {
    const first = createMockApi();
    const second = createMockApi();
    const seen: FindingsApi[] = [];
    function Probe() {
      seen.push(usePort('findings'));
      return null;
    }
    const { rerender } = render(
      <ApiProvider api={first}>
        <Probe />
      </ApiProvider>,
    );
    rerender(
      <ApiProvider api={second}>
        <Probe />
      </ApiProvider>,
    );
    expect(seen[0]).toBe(first);
    expect(seen.at(-1)).toBe(second);
  });
});
