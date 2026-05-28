import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://kimamov.github.io',
	base: '/FormLayer/',
	integrations: [
		starlight({
			title: 'FormLayer',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/kimamov/FormLayer' }],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'guides/introduction' },
						{ label: 'Quick Start', slug: 'guides/quick-start' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Validation', slug: 'guides/validation' },
						{ label: 'Error Rendering', slug: 'guides/error-rendering' },
						{ label: 'Events & Hooks', slug: 'guides/events' },
						{ label: 'Loading State', slug: 'guides/loading-state' },
						{ label: 'Plugins', slug: 'guides/plugins' },
						{ label: 'Standalone Fields', slug: 'guides/standalone-fields' },
					],
				},
				{
					label: 'TYPO3 Integration',
					items: [
						{ label: 'Setup', slug: 'guides/typo3-setup' },
						{ label: 'Multistep Forms', slug: 'guides/typo3-multistep' },
						{ label: 'Backend (PHP)', slug: 'guides/typo3-backend' },
					],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
			],
		}),
	],
});
