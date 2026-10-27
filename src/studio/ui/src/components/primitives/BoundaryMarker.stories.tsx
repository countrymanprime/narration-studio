import type { Meta, StoryObj } from '@storybook/react-vite';
import { BoundaryMarker } from './BoundaryMarker';

// One marker for a chapter end and a page break: the same dashed rules and label, so the two cannot drift.
const meta = {
  title: 'Primitives/BoundaryMarker',
  component: BoundaryMarker,
  args: { variant: 'chapterEnd', children: 'End of Chapter 7 · 2,044 words' },
} satisfies Meta<typeof BoundaryMarker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChapterEnd: Story = {};

export const PageBreak: Story = { args: { variant: 'page', children: 'Page 12' } };
