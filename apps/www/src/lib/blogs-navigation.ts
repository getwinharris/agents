import type { DocsSection } from './docs-navigation';

export const blogsSection: DocsSection = {
	key: 'blogs',
	title: 'Blogs',
	landingSlug: '',
	groups: [
		{
			title: 'Categories',
			items: [
				{ title: 'Announcements', slug: 'announcement' },
				{ title: 'Releases', slug: 'release' },
				{ title: 'Research', slug: 'research' },
				{ title: 'Tutorials', slug: 'tutorials' },
			],
		},
	],
};
