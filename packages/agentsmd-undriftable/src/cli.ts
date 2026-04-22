#!/usr/bin/env bun
/**
 * amdu — `agentsmd-undriftable` CLI entrypoint.
 *
 * Usage:
 *
 *   amdu gen    — create a fresh AGENTS.md (fails if one already exists)
 *   amdu sync   — regenerate the deterministic block inside an existing
 *                 AGENTS.md, preserving the prose above/below the markers
 *
 * Shared flags:
 *
 *   --root <dir>        Project root (default: cwd)
 *   --src <dir>         Source directory to walk (default: <root>/src)
 *   --tsconfig <path>   tsconfig.json to load (default: <root>/tsconfig.json)
 *   --agents-md <path>  Output file (default: <root>/AGENTS.md)
 *   --no-drift          Skip drift link calls
 *
 * @since 0.1.0
 */

import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, Path } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import * as Errors from './Errors.ts';
import * as Generator from './Generator.ts';

// ───────────────────────────────────────────────────────────────────────────
// Shared flags
// ───────────────────────────────────────────────────────────────────────────

const amdu = Command.make('amdu').pipe(
	Command.withSharedFlags({
		root: Flag.directory('root').pipe(
			Flag.withDescription(
				'Project root (where tsconfig.json lives). Defaults to cwd.'
			),
			Flag.optional
		),
		src: Flag.directory('src').pipe(
			Flag.withDescription(
				'Source directory to walk. Defaults to <root>/src.'
			),
			Flag.optional
		),
		tsconfig: Flag.file('tsconfig').pipe(
			Flag.withDescription(
				'Path to tsconfig.json. Defaults to <root>/tsconfig.json.'
			),
			Flag.optional
		),
		agentsMd: Flag.file('agents-md').pipe(
			Flag.withDescription(
				'Path to AGENTS.md to create/update. Defaults to <root>/AGENTS.md.'
			),
			Flag.optional
		),
		noDrift: Flag.boolean('no-drift').pipe(
			Flag.withDescription(
				'Skip `drift link` invocations. Useful for dry runs or when drift is not installed.'
			),
			Flag.withDefault(false)
		)
	})
);

// ───────────────────────────────────────────────────────────────────────────
// Resolved options
// ───────────────────────────────────────────────────────────────────────────

import * as Option from 'effect/Option';

const resolveOptions = Effect.fn('amdu.resolveOptions')(function*(parent: {
	readonly root: Option.Option<string>;
	readonly src: Option.Option<string>;
	readonly tsconfig: Option.Option<string>;
	readonly agentsMd: Option.Option<string>;
	readonly noDrift: boolean;
}) {
	const path = yield* Path.Path;
	const root = path.resolve(
		Option.getOrElse(parent.root, () => process.cwd())
	);
	const srcRoot = path.resolve(
		Option.getOrElse(parent.src, () => path.join(root, 'src'))
	);
	const tsConfigFilePath = path.resolve(
		Option.getOrElse(
			parent.tsconfig,
			() => path.join(root, 'tsconfig.json')
		)
	);
	const agentsMdPath = path.resolve(
		Option.getOrElse(parent.agentsMd, () => path.join(root, 'AGENTS.md'))
	);
	const options: Generator.Options = {
		root,
		srcRoot,
		tsConfigFilePath,
		agentsMdPath,
		runDriftLink: !parent.noDrift
	};
	return options;
});

// ───────────────────────────────────────────────────────────────────────────
// Reporting
// ───────────────────────────────────────────────────────────────────────────

const reportError = (
	phase: 'gen' | 'sync',
	error: Errors.AmduError
): Effect.Effect<void> => Console.error(`amdu ${phase}: ${error.message}`);

const reportSuccess = (
	phase: 'gen' | 'sync',
	options: Generator.Options
): Effect.Effect<void> =>
	Console.log(`amdu ${phase}: wrote ${options.agentsMdPath}`);

// ───────────────────────────────────────────────────────────────────────────
// Subcommands
// ───────────────────────────────────────────────────────────────────────────

const gen = Command.make(
	'gen',
	{},
	Effect.fn(function*() {
		const parent = yield* amdu;
		const options = yield* resolveOptions(parent);
		const generator = yield* Generator.Service;
		yield* generator.gen(options).pipe(
			Effect.catchTag(
				'AmduError',
				(error) =>
					reportError('gen', error).pipe(
						Effect.andThen(Effect.fail(error))
					)
			)
		);
		yield* reportSuccess('gen', options);
	})
).pipe(
	Command.withDescription(
		'Create a fresh AGENTS.md. Fails if one already exists.'
	)
);

const sync = Command.make(
	'sync',
	{},
	Effect.fn(function*() {
		const parent = yield* amdu;
		const options = yield* resolveOptions(parent);
		const generator = yield* Generator.Service;
		yield* generator.sync(options).pipe(
			Effect.catchTag(
				'AmduError',
				(error) =>
					reportError('sync', error).pipe(
						Effect.andThen(Effect.fail(error))
					)
			)
		);
		yield* reportSuccess('sync', options);
	})
).pipe(
	Command.withDescription(
		'Regenerate the deterministic block inside AGENTS.md, preserving prose above/below the markers.'
	)
);

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

amdu.pipe(
	Command.withSubcommands([gen, sync]),
	Command.provide(Generator.defaultLayer),
	Command.run({ version: '0.1.0' }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain
);
