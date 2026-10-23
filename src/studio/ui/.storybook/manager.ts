import { addons } from 'storybook/manager-api';
import { themes } from 'storybook/theming';

// Storybook's own frame (sidebar, toolbar, addon panels) opens dark when the story's theme global does: the public site's Storybook page opens
// it with `globals=theme:dark` when the site is dark (apps/site/build/windowPages.mjs). The Theme toolbar still switches the story either way.
const dark = /(?:^|;)theme:dark(?:;|$)/.test(new URLSearchParams(window.location.search).get('globals') ?? '');

addons.setConfig({ theme: dark ? themes.dark : themes.light });
