/**
 * Regression tests for SkillCatalog self-discovery of bundled effect-* skills.
 *
 * The skill gate must credit reads of the harness's own SKILL.md files even when
 * Pi registered no `/skill:*` commands for the session (e.g. subagent children
 * spawned with `--no-skills`). Before self-discovery, the catalog was built only
 * from `pi.getCommands()`, so those children reported 0 loaded skills forever and
 * every Effect write was blocked.
 */

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Path } from 'effect';

import { SkillCatalog } from '../src/services/SkillCatalog.ts';

const nodePlatformLayer = Layer.mergeAll(
	NodeFileSystem.layer,
	NodePath.layer
);

const BUNDLED_SKILL_NAME = 'effect-ai-tool';

const withCatalog = <A, E>(
	use: (
		catalog: SkillCatalog.Interface
	) => Effect.Effect<A, E, Path.Path>
) => Effect.gen(function*() {
	const path = yield* Path.Path;
	const bundledSkillsDir = path.resolve(
		import.meta.dirname ?? '.',
		'..',
		'skills'
	);
	const layer = SkillCatalog.layer(bundledSkillsDir).pipe(
		Layer.provideMerge(nodePlatformLayer)
	);
	return yield* SkillCatalog.Service.use(use).pipe(Effect.provide(layer));
}).pipe(Effect.provide(nodePlatformLayer));

describe('SkillCatalog bundled self-discovery', () => {
	it.live('credits a bundled SKILL.md read with no registered commands', () =>
		withCatalog((catalog) =>
			Effect.gen(function*() {
				// Simulate a `--no-skills` child: rebuild with zero commands.
				yield* catalog.rebuild([], process.cwd());
				const path = yield* Path.Path;
				const skillFilePath = path.resolve(
					import.meta.dirname ?? '.',
					'..',
					'skills',
					BUNDLED_SKILL_NAME,
					'SKILL.md'
				);
				const matched = yield* catalog.matchPath(skillFilePath);
				expect(Option.isSome(matched)).toBe(true);
				expect(
					Option.getOrElse(
						Option.map(matched, (entry) => entry.name),
						() => ''
					)
				).toBe(BUNDLED_SKILL_NAME);
			})
		));

	it.live('credits a bundled skill asset read (non-SKILL.md under the skill dir)', () =>
		withCatalog((catalog) =>
			Effect.gen(function*() {
				yield* catalog.rebuild([], process.cwd());
				const path = yield* Path.Path;
				const assetPath = path.resolve(
					import.meta.dirname ?? '.',
					'..',
					'skills',
					BUNDLED_SKILL_NAME,
					'examples',
					'snippet.ts'
				);
				const matched = yield* catalog.matchPath(assetPath);
				expect(Option.isSome(matched)).toBe(true);
			})
		));

	it.live('does not match unrelated paths', () =>
		withCatalog((catalog) =>
			Effect.gen(function*() {
				yield* catalog.rebuild([], process.cwd());
				const matched = yield* catalog.matchPath(
					'/tmp/not-a-skill/program.ts'
				);
				expect(Option.isNone(matched)).toBe(true);
			})
		));
});
