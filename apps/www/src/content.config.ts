import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
	docs: defineCollection({
		loader: glob({
			base: './src/content/docs',
			pattern: [
				'**/[^_]*.{markdown,mdown,mkdn,mkd,mdwn,md,mdx}',
				'!cli/**',
				'!guide/**',
				'!api/**',
				'!sdk/**',
				'!ecosystem/**',
				'!reference/**',
			],
		}),
		schema: z.object({
			title: z.string(),
			description: z.string().optional(),
			lastReviewedAt: z.coerce.date().optional(),
			subtitle: z.string().optional(),
			package: z
				.object({
					name: z.string(),
					href: z.url(),
				})
				.optional(),
			tableOfContents: z
				.union([
					z.boolean(),
					z.object({
						minHeadingLevel: z.number().int().min(1).max(6).optional(),
						maxHeadingLevel: z.number().int().min(1).max(6).optional(),
					}),
				])
				.optional(),
		}),
	}),
	blogs: defineCollection({
		loader: glob({
			base: './src/content/blogs',
			pattern: '**/[^_]*.{md,mdx}',
		}),
		schema: z.object({
			title: z.string(),
			description: z.string().optional(),
			pubDate: z.coerce.date(),
			author: z.string().optional(),
			authorUrl: z.string().optional(),
			category: z
				.enum(['release', 'research', 'announcement', 'tutorials'])
				.default('announcement'),
			tags: z.array(z.string()).optional(),
		}),
	}),
};
