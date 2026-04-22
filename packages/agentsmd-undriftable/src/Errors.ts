/**
 * AmduError — single tagged error for the `agentsmd-undriftable` CLI and
 * library.
 *
 * All `amdu` services fail with a `AmduError` whose `reason` discriminates
 * between the specific failure modes. Consumers recover precisely via
 * `Effect.catchReason("AmduError", "<ReasonTag>", handler)` or promote the
 * reason union into the error channel with
 * `Effect.unwrapReason("AmduError")` followed by `Effect.catchTags`.
 *
 * @since 0.1.0
 */

import { Match } from 'effect';
import * as Schema from 'effect/Schema';

// ───────────────────────────────────────────────────────────────────────────
// Reason variants
// ───────────────────────────────────────────────────────────────────────────

/**
 * `amdu gen` was asked to create an AGENTS.md that already exists.
 *
 * @category Reasons
 * @since 0.1.0
 */
export class AgentsMdExists extends Schema.TaggedErrorClass<AgentsMdExists>()(
	'AgentsMdExists',
	{ path: Schema.String },
	{
		description:
			'`amdu gen` refuses to overwrite an existing AGENTS.md; use `amdu sync` instead.'
	}
) {}

/**
 * Generated-section markers are missing or malformed in an existing
 * AGENTS.md during `amdu sync`.
 *
 * @category Reasons
 * @since 0.1.0
 */
export class MarkersMissing extends Schema.TaggedErrorClass<MarkersMissing>()(
	'MarkersMissing',
	{ path: Schema.String, detail: Schema.String },
	{
		description:
			'AGENTS.md does not contain a valid <!-- amdu:begin --> / <!-- amdu:end --> fenced block.'
	}
) {}

/**
 * A filesystem operation (read/write/stat) failed.
 *
 * @category Reasons
 * @since 0.1.0
 */
export class FsFailure extends Schema.TaggedErrorClass<FsFailure>()(
	'FsFailure',
	{
		op: Schema.String,
		path: Schema.String,
		cause: Schema.Defect
	},
	{ description: 'A filesystem operation failed.' }
) {}

/**
 * `ts-morph` could not load the project (missing tsconfig, malformed
 * source, etc.).
 *
 * @category Reasons
 * @since 0.1.0
 */
export class ProjectLoadFailure
	extends Schema.TaggedErrorClass<ProjectLoadFailure>()(
		'ProjectLoadFailure',
		{ tsConfig: Schema.String, cause: Schema.Defect },
		{ description: 'ts-morph failed to load the TypeScript project.' }
	) {}

/**
 * The `drift` CLI exited non-zero or could not be spawned.
 *
 * @category Reasons
 * @since 0.1.0
 */
export class DriftFailure extends Schema.TaggedErrorClass<DriftFailure>()(
	'DriftFailure',
	{
		argv: Schema.Array(Schema.String),
		exitCode: Schema.Int,
		stderr: Schema.String
	},
	{ description: 'The `drift` CLI failed.' }
) {}

/**
 * `drift` is not installed / not on PATH.
 *
 * @category Reasons
 * @since 0.1.0
 */
export class DriftNotFound extends Schema.TaggedErrorClass<DriftNotFound>()(
	'DriftNotFound',
	{ cause: Schema.Defect },
	{ description: 'The `drift` binary was not found on PATH.' }
) {}

// ───────────────────────────────────────────────────────────────────────────
// Union + umbrella error
// ───────────────────────────────────────────────────────────────────────────

/**
 * Union of all `AmduError` reasons.
 *
 * @category Reasons
 * @since 0.1.0
 */
export const Reason = Schema.Union([
	AgentsMdExists,
	MarkersMissing,
	FsFailure,
	ProjectLoadFailure,
	DriftFailure,
	DriftNotFound
]);

/**
 * @category Types
 * @since 0.1.0
 */
export type Reason = typeof Reason.Type;

/**
 * Umbrella error emitted by every `amdu` service. Always carries a `reason`
 * pointing to one of the reason classes above.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class AmduError extends Schema.TaggedErrorClass<AmduError>()(
	'AmduError',
	{ reason: Reason },
	{ description: 'Failure from an `amdu` service.' }
) {
	/**
	 * Human-readable message formatted from the wrapped reason. Referenced
	 * by Effect's default Cause/Exit pretty-printer.
	 */
	override get message(): string {
		return formatReason(this.reason);
	}
}

const formatReason: (reason: Reason) => string = Match.typeTags<Reason>()({
	AgentsMdExists: (r) =>
		`AGENTS.md already exists at ${r.path}; use \`amdu sync\` to update it`,
	MarkersMissing: (r) => `AGENTS.md at ${r.path}: ${r.detail}`,
	FsFailure: (r) => `${r.op} failed for ${r.path}: ${String(r.cause)}`,
	ProjectLoadFailure: (r) =>
		`failed to load TS project at ${r.tsConfig}: ${String(r.cause)}`,
	DriftFailure: (r) =>
		`\`drift ${r.argv.join(' ')}\` exited ${r.exitCode}${
			r.stderr.length === 0 ? '' : `: ${r.stderr.trim()}`
		}`,
	DriftNotFound: (r) =>
		`\`drift\` binary not found on PATH: ${String(r.cause)}`
});

// ───────────────────────────────────────────────────────────────────────────
// Smart constructors
// ───────────────────────────────────────────────────────────────────────────

/**
 * @category Constructors
 * @since 0.1.0
 */
export const agentsMdExists = (path: string): AmduError =>
	new AmduError({ reason: new AgentsMdExists({ path }) });

/**
 * @category Constructors
 * @since 0.1.0
 */
export const markersMissing = (path: string, detail: string): AmduError =>
	new AmduError({ reason: new MarkersMissing({ path, detail }) });

/**
 * @category Constructors
 * @since 0.1.0
 */
export const fsFailure = (
	op: string,
	path: string,
	cause: unknown
): AmduError => new AmduError({ reason: new FsFailure({ op, path, cause }) });

/**
 * @category Constructors
 * @since 0.1.0
 */
export const projectLoadFailure = (
	tsConfig: string,
	cause: unknown
): AmduError =>
	new AmduError({ reason: new ProjectLoadFailure({ tsConfig, cause }) });

/**
 * @category Constructors
 * @since 0.1.0
 */
export const driftFailure = (params: {
	readonly argv: ReadonlyArray<string>;
	readonly exitCode: number;
	readonly stderr: string;
}): AmduError =>
	new AmduError({
		reason: new DriftFailure({
			argv: params.argv,
			exitCode: params.exitCode,
			stderr: params.stderr
		})
	});

/**
 * @category Constructors
 * @since 0.1.0
 */
export const driftNotFound = (cause: unknown): AmduError =>
	new AmduError({ reason: new DriftNotFound({ cause }) });
