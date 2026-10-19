import { parseMarkup, type MarkupNode } from './evidenceQuotes';

function Nodes({ nodes }: { nodes: MarkupNode[] }) {
  return nodes.map((node, index) => {
    if (typeof node === 'string') return node;
    const Tag = node.tag;
    return (
      <Tag key={index} className={node.tag === 'b' || node.tag === 'del' || node.tag === 'ins' ? 'font-semibold' : undefined}>
        <Nodes nodes={node.children} />
      </Tag>
    );
  });
}

/** A note's markup (`<i> <b> <del> <ins>` only, see `parseMarkup`) drawn as elements: the marked word is bold, never colour alone. */
export function Markup({ source }: { source: string }) {
  return <Nodes nodes={parseMarkup(source)} />;
}
