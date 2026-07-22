import type { DocsSection } from './docs-navigation';

export const blogsSection: DocsSection = {
	key: 'blogs',
	title: 'Blogs',
	landingSlug: '',
	groups: [
		{
			title: 'Categories',
			items: [
				{ title: 'Announcements', href: '/blogs/announcement/' },
				{ title: 'Releases', href: '/blogs/release/' },
				{ title: 'Research', href: '/blogs/research/' },
				{ title: 'Tutorials', href: '/blogs/tutorials/' },
			],
		},
	],
};
