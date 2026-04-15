/**
 * Guidance Doc Loader
 *
 * Reads the guidance markdown files from the docs/ directory and wraps
 * each in an XML tag for injection into the LLM context. These docs
 * are injected once per session (and re-injected after compaction)
 * so the agent has foundational Effect v4 knowledge.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface GuidanceDoc {
	readonly file: string;
	readonly tag: string;
}

const GUIDANCE_DOCS: ReadonlyArray<GuidanceDoc> = [
	{
		file: 'progressive-disclosure-guidance.md',
		tag: 'progressive-disclosure-guidance'
	},
	{
		file: 'effect-first-development.md',
		tag: 'effect-first-development-guide'
	},
	{
		file: 'post__effect-and-the-near-inexpressible-majesty-of-layers.md',
		tag: 'effect-layers-guide'
	}
];

const docsDir = path.join(import.meta.dirname ?? '.', '..', 'docs');

const readDoc = (doc: GuidanceDoc): string | null => {
	try {
		const content = fs.readFileSync(
			path.join(docsDir, doc.file),
			'utf-8'
		);
		return `<${doc.tag}>\n${content}\n</${doc.tag}>`;
	} catch {
		return null;
	}
};

/**
 * Load all guidance docs from disk, wrapped in XML tags.
 * Returns an array of non-empty strings (one per successfully read doc).
 */
export const loadGuidanceDocs = (): string[] => {
	const results: string[] = [];
	for (const doc of GUIDANCE_DOCS) {
		const wrapped = readDoc(doc);
		if (wrapped) results.push(wrapped);
	}
	return results;
};
