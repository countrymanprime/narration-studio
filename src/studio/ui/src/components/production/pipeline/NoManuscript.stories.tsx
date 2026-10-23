import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '../../primitives/Button';
import { NoManuscript } from './NoManuscript';

const meta = {
  title: 'Production/NoManuscript',
  component: NoManuscript,
  args: { projectName: 'A project', importButton: <Button>Import manuscript</Button>, onSetDueDate: fn() },
} satisfies Meta<typeof NoManuscript>;

export default meta;
export const Empty: StoryObj<typeof meta> = {};
