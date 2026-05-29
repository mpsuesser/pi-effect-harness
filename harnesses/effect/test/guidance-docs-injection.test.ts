/**
 * Verifies that the guidance docs under harnesses/effect/guidance/ are
 * loaded once at layer construction and injected at the top of the policy
 * header that is delivered via Decision.InjectSystemPrompt on every
 * before_agent_start.
 */

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path } from 'effect';

import {
	buildPolicyHeader,
	GuidanceCatalog
} from '../src/services/GuidanceCatalog.ts';

const nodePlatformLayer = Layer.mergeAll(
	NodeFileSystem.layer,
	NodePath.layer
);

const guidanceDirEffect = Effect.gen(function*() {
	const path = yield* Path.Path;
	return path.resolve(import.meta.dirname ?? '.', '..', 'guidance');
});

const guidanceCatalogLayer = Layer.unwrap(
	Effect.gen(function*() {
		const guidanceDir = yield* guidanceDirEffect;
		return GuidanceCatalog.layer(guidanceDir);
	})
).pipe(Layer.provide(nodePlatformLayer));

describe('guidance docs injection', () => {
	it.effect('emits all guidance docs ahead of the policy header', () =>
		Effect.gen(function*() {
			const guidanceDir = yield* guidanceDirEffect;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const entries = yield* fs.readDirectory(guidanceDir);
			const expectedDocs = entries.filter((entry) =>
				entry.endsWith('.md')
			);
			expect(expectedDocs.length).toBeGreaterThan(0);

			const docHeadlines = yield* Effect.forEach(
				expectedDocs,
				(docName) =>
					fs.readFileString(path.join(guidanceDir, docName)).pipe(
						Effect.map((content) =>
							content.trim().split('\n')[0] ?? ''
						)
					)
			);

			const catalog = yield* GuidanceCatalog.Service;
			const header = yield* catalog.policyHeader(new Set());

			docHeadlines.forEach((headline) => {
				expect(header).toContain(headline);
			});
			expect(header).toContain('# Parse, don’t validate');
			expect(header).toContain('pi-effect-harness policy:');
			expect(header.indexOf('pi-effect-harness policy:'))
				.toBeGreaterThan(0);
		}).pipe(
			Effect.provide(Layer.merge(guidanceCatalogLayer, nodePlatformLayer))
		));

	it('points agents at the current Effect reference docs', () => {
		const header = buildPolicyHeader(new Set());

		expect(header).toContain('~/.cache/effect-v4/LLMS.md');
		expect(header).toContain('~/.cache/effect-v4/ai-docs/src/');
		expect(header).toContain(
			'~/.cache/effect-v4/packages/effect/SCHEMA.md'
		);
		expect(header).toContain(
			'~/.cache/effect-v4/packages/effect/HTTPAPI.md'
		);
		expect(header).toContain(
			'~/.cache/effect-v4/packages/effect/CONFIG.md'
		);
		expect(header).toContain('~/.cache/effect-v4/packages/effect/MCP.md');
		expect(header).toContain('~/.cache/effect-v4/packages/effect/OPTIC.md');
		expect(header).toContain(
			'~/.cache/effect-v4/packages/vitest/README.md'
		);
		expect(header).toContain('~/.cache/effect-v4/cookbooks/schedule.md');
		expect(header).toContain('~/.cache/effect-v4/packages/effect/src/');
		expect(header).not.toContain('~/.cache/effect-v4/MIGRATION.md');
		expect(header).not.toContain('~/.cache/effect-v4/migration/');
		expect(header).not.toContain('~/.cache/effect-v4/.specs/');
		expect(header).not.toContain('~/.cache/effect-v4/.patterns/');
	});
});
