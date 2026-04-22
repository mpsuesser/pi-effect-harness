/**
 * Generator — orchestrates the full `amdu gen` / `amdu sync` pipeline:
 *
 * 1. `TsMorphProject.load` — load the TS project and enumerate source files
 * 2. `Extractor.extract` — walk each source file into a `FileClosureSet`
 * 3. `Renderer.render` — render the closure sets into the managed block
 * 4. Read the existing `AGENTS.md` (if any)
 * 5. Assemble the new file content (create-new vs merge-around-markers)
 * 6. Write the file
 * 7. `Drift.link` — stamp one drift anchor per source file
 *
 * The `gen` and `sync` commands share every step except step 4/5: `gen`
 * refuses to run when the file already exists; `sync` splits the existing
 * file and preserves the prose above/below the markers.
 *
 * @since 0.1.0
 */

import { Context, Effect, FileSystem, Layer, Path } from 'effect';

import * as AgentsMdMerger from './AgentsMdMerger.ts';
import * as Drift from './Drift.ts';
import * as Errors from './Errors.ts';
import * as Extractor from './Extractor.ts';
import * as Renderer from './Renderer.ts';
import * as TsMorphProject from './TsMorphProject.ts';

// ───────────────────────────────────────────────────────────────────────────
// Options
// ───────────────────────────────────────────────────────────────────────────

/**
 * Shared options accepted by {@link Interface.gen} and
 * {@link Interface.sync}.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Options {
	/** Absolute path to the project root (contains `tsconfig.json`). */
	readonly root: string;
	/** Absolute path to the source root to walk (e.g. `<root>/src`). */
	readonly srcRoot: string;
	/** Absolute path to the `tsconfig.json` to load. */
	readonly tsConfigFilePath: string;
	/** Absolute path to the `AGENTS.md` file to create / update. */
	readonly agentsMdPath: string;
	/** Whether to run `drift link` for each source file. */
	readonly runDriftLink: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Service
// ───────────────────────────────────────────────────────────────────────────

/**
 * Capability surface of {@link Service}.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Interface {
	/**
	 * Create a brand new `AGENTS.md` from scratch. Fails with
	 * `AgentsMdExists` if the file already exists.
	 */
	readonly gen: (options: Options) => Effect.Effect<void, Errors.AmduError>;

	/**
	 * Regenerate the deterministic block inside an existing `AGENTS.md`,
	 * preserving prose above and below the `<!-- amdu:begin -->` /
	 * `<!-- amdu:end -->` markers. When the file does not yet exist,
	 * behaves like `gen`.
	 */
	readonly sync: (options: Options) => Effect.Effect<void, Errors.AmduError>;
}

/**
 * The `Generator` service identity.
 *
 * @category Service
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
	'agentsmd-undriftable/Generator'
) {}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const normalizeSep = (value: string): string => value.replace(/\\/g, '/');

const defaultPrelude = (): string =>
	[
		'# AGENTS.md',
		'',
		'_(manual prose above the marker is preserved across `amdu sync`)_',
		'',
		''
	].join('\n');

const defaultPostlude = (): string => '\n';

// ───────────────────────────────────────────────────────────────────────────
// Layer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Raw layer — declares dependencies on the constituent services and
 * platform services.
 *
 * @category Layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<
	Service,
	never,
	| TsMorphProject.Service
	| Extractor.Service
	| Renderer.Service
	| AgentsMdMerger.Service
	| Drift.Service
	| FileSystem.FileSystem
	| Path.Path
> = Layer.effect(
	Service,
	Effect.gen(function*() {
		const tsMorphProject = yield* TsMorphProject.Service;
		const extractor = yield* Extractor.Service;
		const renderer = yield* Renderer.Service;
		const merger = yield* AgentsMdMerger.Service;
		const drift = yield* Drift.Service;
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const buildManagedBlock = (options: Options) =>
			Effect.gen(function*() {
				const { project: _project, sourceFiles } = yield* tsMorphProject
					.load({
						tsConfigFilePath: options.tsConfigFilePath,
						srcRoot: options.srcRoot
					});

				const normalizedRoot = normalizeSep(
					options.root.endsWith('/')
						? options.root
						: `${options.root}/`
				);

				const fileSets = yield* Effect.forEach(
					sourceFiles,
					(sourceFile) => {
						const absolute = normalizeSep(sourceFile.getFilePath());
						const relative = absolute.startsWith(normalizedRoot)
							? absolute.slice(normalizedRoot.length)
							: absolute;
						return extractor.extract({
							sourceFile,
							relativePath: relative
						});
					},
					{ concurrency: 1 }
				);

				const block = yield* renderer.render(fileSets);
				return { block, fileSets };
			});

		const runDriftLinks = (
			options: Options,
			fileSets: ReadonlyArray<{ readonly relativePath: string; }>
		) => options.runDriftLink
			? Effect.forEach(
				fileSets,
				(fileSet) =>
					drift.link({
						cwd: options.root,
						agentsMdPath: path.relative(
							options.root,
							options.agentsMdPath
						),
						targetPath: fileSet.relativePath
					}),
				{ concurrency: 1 }
			).pipe(Effect.asVoid)
			: Effect.void;

		const writeAgentsMd = (
			options: Options,
			content: string
		): Effect.Effect<void, Errors.AmduError> =>
			fs
				.writeFileString(options.agentsMdPath, content)
				.pipe(
					Effect.mapError((cause) =>
						Errors.fsFailure(
							'writeFileString',
							options.agentsMdPath,
							cause
						)
					)
				);

		const gen = Effect.fn('Generator.gen')(function*(options: Options) {
			const exists = yield* fs
				.exists(options.agentsMdPath)
				.pipe(
					Effect.mapError((cause) =>
						Errors.fsFailure(
							'exists',
							options.agentsMdPath,
							cause
						)
					)
				);
			if (exists) {
				return yield* Errors.agentsMdExists(options.agentsMdPath);
			}

			const { block, fileSets } = yield* buildManagedBlock(options);
			const content = `${defaultPrelude()}${block}${defaultPostlude()}`;
			yield* writeAgentsMd(options, content);
			yield* runDriftLinks(options, fileSets);
		});

		const sync = Effect.fn('Generator.sync')(function*(options: Options) {
			const exists = yield* fs
				.exists(options.agentsMdPath)
				.pipe(
					Effect.mapError((cause) =>
						Errors.fsFailure(
							'exists',
							options.agentsMdPath,
							cause
						)
					)
				);
			const { block, fileSets } = yield* buildManagedBlock(options);

			if (!exists) {
				const content =
					`${defaultPrelude()}${block}${defaultPostlude()}`;
				yield* writeAgentsMd(options, content);
				yield* runDriftLinks(options, fileSets);
				return;
			}

			const existing = yield* fs
				.readFileString(options.agentsMdPath)
				.pipe(
					Effect.mapError((cause) =>
						Errors.fsFailure(
							'readFileString',
							options.agentsMdPath,
							cause
						)
					)
				);

			const segments = yield* merger.split({
				path: options.agentsMdPath,
				content: existing
			});
			const merged = yield* merger.join({
				prelude: segments.prelude,
				newManagedBlock: block,
				postlude: segments.postlude
			});
			yield* writeAgentsMd(options, merged);
			yield* runDriftLinks(options, fileSets);
		});

		return Service.of({ gen, sync });
	})
);

/**
 * Fully-wired layer — composes `layer` with the default implementations
 * of every dependent `amdu` service. Consumers still need to provide the
 * platform layer (`NodeServices.layer` / `BunServices.layer`) externally.
 *
 * @category Layers
 * @since 0.1.0
 */
export const defaultLayer: Layer.Layer<
	Service,
	never,
	| FileSystem.FileSystem
	| Path.Path
	| import('effect/unstable/process').ChildProcessSpawner.ChildProcessSpawner
> = layer.pipe(
	Layer.provide(TsMorphProject.layer),
	Layer.provide(Extractor.layer),
	Layer.provide(Renderer.layer),
	Layer.provide(AgentsMdMerger.layer),
	Layer.provide(Drift.layer)
);
