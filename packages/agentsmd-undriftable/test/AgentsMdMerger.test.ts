import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import * as AgentsMdMerger from '../src/AgentsMdMerger.ts';
import { BEGIN_MARKER, END_MARKER } from '../src/Renderer.ts';

describe('AgentsMdMerger', () =>
{
	describe('split', () =>
	{
		it.effect('splits content around the markers', () =>
			Effect.gen(function*()
			{
				const merger = yield* AgentsMdMerger.Service;
				const content =
					`# Title\n\nmanual prose\n\n${BEGIN_MARKER}\n<managed>\n${END_MARKER}\n\ntrailing prose\n`;
				const segments = yield* merger.split({
					path: 'AGENTS.md',
					content,
				});
				assert.strictEqual(
					segments.prelude,
					'# Title\n\nmanual prose\n\n',
				);
				assert.strictEqual(segments.managed, '\n<managed>\n');
				assert.strictEqual(segments.postlude, '\n\ntrailing prose\n');
			}).pipe(Effect.provide(AgentsMdMerger.layer)));

		it.effect('fails with MarkersMissing when no markers present', () =>
			Effect.gen(function*()
			{
				const merger = yield* AgentsMdMerger.Service;
				const result = yield* Effect.flip(
					merger.split({
						path: 'AGENTS.md',
						content: '# Just prose\n',
					}),
				);
				assert.strictEqual(result.reason._tag, 'MarkersMissing');
			}).pipe(Effect.provide(AgentsMdMerger.layer)));

		it.effect('fails with MarkersMissing on duplicate begin markers', () =>
			Effect.gen(function*()
			{
				const merger = yield* AgentsMdMerger.Service;
				const content =
					`${BEGIN_MARKER}\nfoo\n${END_MARKER}\nmid\n${BEGIN_MARKER}\nbar\n${END_MARKER}\n`;
				const result = yield* Effect.flip(
					merger.split({ path: 'AGENTS.md', content }),
				);
				assert.strictEqual(result.reason._tag, 'MarkersMissing');
			}).pipe(Effect.provide(AgentsMdMerger.layer)));

		it.effect('fails with MarkersMissing when begin is after end', () =>
			Effect.gen(function*()
			{
				const merger = yield* AgentsMdMerger.Service;
				const content = `${END_MARKER}\nmid\n${BEGIN_MARKER}\n`;
				const result = yield* Effect.flip(
					merger.split({ path: 'AGENTS.md', content }),
				);
				assert.strictEqual(result.reason._tag, 'MarkersMissing');
			}).pipe(Effect.provide(AgentsMdMerger.layer)));
	});

	describe('join', () =>
	{
		it.effect('reassembles exactly in the absence of changes', () =>
			Effect.gen(function*()
			{
				const merger = yield* AgentsMdMerger.Service;
				const content =
					`# Title\n\n${BEGIN_MARKER}\n<managed>\n${END_MARKER}\n\ntail\n`;
				const segments = yield* merger.split({
					path: 'AGENTS.md',
					content,
				});
				const joined = yield* merger.join({
					prelude: segments.prelude,
					// put the markers back around the managed slice
					newManagedBlock:
						`${BEGIN_MARKER}${segments.managed}${END_MARKER}`,
					postlude: segments.postlude,
				});
				assert.strictEqual(joined, content);
			}).pipe(Effect.provide(AgentsMdMerger.layer)));

		it.effect('replaces only the managed block', () =>
			Effect.gen(function*()
			{
				const merger = yield* AgentsMdMerger.Service;
				const joined = yield* merger.join({
					prelude: '# Title\n\n',
					newManagedBlock: `${BEGIN_MARKER}\nnew!\n${END_MARKER}`,
					postlude: '\n\ntail\n',
				});
				assert.strictEqual(
					joined,
					`# Title\n\n${BEGIN_MARKER}\nnew!\n${END_MARKER}\n\ntail\n`,
				);
			}).pipe(Effect.provide(AgentsMdMerger.layer)));
	});
});
