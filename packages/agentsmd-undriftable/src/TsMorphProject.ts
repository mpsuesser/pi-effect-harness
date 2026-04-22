/**
 * TsMorphProject — wraps a `ts-morph` `Project` instance, loaded from a
 * `tsconfig.json` rooted at the package being documented.
 *
 * This service is the boundary between `ts-morph` and the rest of the
 * `amdu` pipeline: callers receive already-loaded `SourceFile` objects
 * rather than paths, so the ts-morph dependency does not leak further.
 *
 * @since 0.1.0
 */

import { Context, Effect, Layer } from 'effect';
import * as Arr from 'effect/Array';
import { Project, type SourceFile } from 'ts-morph';

import * as Errors from './Errors.ts';

// ───────────────────────────────────────────────────────────────────────────
// Options
// ───────────────────────────────────────────────────────────────────────────

/**
 * Options accepted by {@link Interface.load}.
 *
 * @category Models
 * @since 0.1.0
 */
export interface LoadOptions {
	/**
	 * Absolute path to the `tsconfig.json` that the project should load
	 * from. Any `include` / `exclude` / `files` glob in the config is
	 * honored.
	 */
	readonly tsConfigFilePath: string;
	/**
	 * Absolute path to the source root. Only source files whose path
	 * begins with this prefix are returned from {@link Interface.sourceFiles}.
	 */
	readonly srcRoot: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Loaded handle
// ───────────────────────────────────────────────────────────────────────────

/**
 * A loaded project handle, carrying the ts-morph `Project` plus the source
 * files that fall under `srcRoot`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Loaded {
	readonly project: Project;
	readonly sourceFiles: ReadonlyArray<SourceFile>;
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
	 * Load a ts-morph `Project` from `tsConfigFilePath` and return it
	 * along with the subset of source files that live under `srcRoot`.
	 */
	readonly load: (
		options: LoadOptions
	) => Effect.Effect<Loaded, Errors.AmduError>;
}

/**
 * The `TsMorphProject` service identity.
 *
 * @category Service
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
	'agentsmd-undriftable/TsMorphProject'
) {}

// ───────────────────────────────────────────────────────────────────────────
// Layer
// ───────────────────────────────────────────────────────────────────────────

const normalizeSep = (value: string): string => value.replace(/\\/g, '/');

const isInNodeModulesOrExternal = (sourceFile: SourceFile): boolean =>
	sourceFile.isFromExternalLibrary() ||
	sourceFile.isInNodeModules() ||
	sourceFile.isDeclarationFile();

const isUnderSrcRoot = (
	sourceFile: SourceFile,
	normalizedSrcRoot: string
): boolean =>
	normalizeSep(sourceFile.getFilePath()).startsWith(normalizedSrcRoot);

/**
 * Layer providing the default {@link Service} implementation.
 *
 * @category Layers
 * @since 0.1.0
 */
const loadImpl = (
	options: LoadOptions
): Effect.Effect<Loaded, Errors.AmduError> =>
	Effect.try({
		try: () =>
			new Project({
				tsConfigFilePath: options.tsConfigFilePath,
				skipAddingFilesFromTsConfig: false,
				skipFileDependencyResolution: false
			}),
		catch: (cause) =>
			Errors.projectLoadFailure(options.tsConfigFilePath, cause)
	}).pipe(
		Effect.map((project) => {
			const normalizedSrcRoot = normalizeSep(
				options.srcRoot.endsWith('/')
					? options.srcRoot
					: `${options.srcRoot}/`
			);
			const sourceFiles = Arr.filter(
				project.getSourceFiles(),
				(sourceFile) =>
					!isInNodeModulesOrExternal(sourceFile) &&
					isUnderSrcRoot(sourceFile, normalizedSrcRoot)
			);
			return { project, sourceFiles };
		})
	);

export const layer: Layer.Layer<Service, never, never> = Layer.succeed(
	Service,
	Service.of({ load: loadImpl })
);
