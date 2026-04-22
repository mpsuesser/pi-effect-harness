/**
 * AgentsMdMerger — splits an existing `AGENTS.md` around the
 * `<!-- amdu:begin -->` / `<!-- amdu:end -->` markers and re-assembles it
 * with a freshly-generated deterministic block in the middle.
 *
 * Manual content above the begin marker and below the end marker is
 * preserved verbatim across `amdu sync`. This is the mechanism the user
 * asked for: the deterministic block is under `amdu`'s control, but the
 * prose framing is under human control.
 *
 * @since 0.1.0
 */

import { Context, Effect, Layer } from 'effect';

import * as Errors from './Errors.ts';
import { BEGIN_MARKER, END_MARKER } from './Renderer.ts';

// ───────────────────────────────────────────────────────────────────────────
// Models
// ───────────────────────────────────────────────────────────────────────────

/**
 * The three segments a managed `AGENTS.md` decomposes into.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Segments {
	/** Everything before (and including the newline before) {@link BEGIN_MARKER}. */
	readonly prelude: string;
	/** Everything between the begin and end markers (excluded). */
	readonly managed: string;
	/** Everything after {@link END_MARKER}, including any trailing newline. */
	readonly postlude: string;
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
	 * Split an existing `AGENTS.md` string into its `prelude` / `managed`
	 * / `postlude` segments. Fails with `MarkersMissing` if the begin /
	 * end markers are missing, out of order, or duplicated.
	 */
	readonly split: (params: {
		readonly path: string;
		readonly content: string;
	}) => Effect.Effect<Segments, Errors.AmduError>;

	/**
	 * Reassemble a full `AGENTS.md` string by replacing only the managed
	 * segment (everything between the markers) with `newManagedBlock`.
	 *
	 * `newManagedBlock` must start with {@link BEGIN_MARKER} and end with
	 * {@link END_MARKER}; the `split` / `join` pair is the inverse of
	 * itself when the managed block is unchanged.
	 */
	readonly join: (params: {
		readonly prelude: string;
		readonly newManagedBlock: string;
		readonly postlude: string;
	}) => Effect.Effect<string>;
}

/**
 * The `AgentsMdMerger` service identity.
 *
 * @category Service
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
	'agentsmd-undriftable/AgentsMdMerger'
) {}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

// Number of non-overlapping occurrences of `needle` in `haystack`.
// `String.prototype.split(needle)` yields N+1 chunks for N occurrences.
const countMatches = (haystack: string, needle: string): number =>
	haystack.split(needle).length - 1;

// ───────────────────────────────────────────────────────────────────────────
// Layer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Layer providing the default {@link Service} implementation.
 *
 * @category Layers
 * @since 0.1.0
 */
const splitImpl = Effect.fn('AgentsMdMerger.split')(function*(params: {
	readonly path: string;
	readonly content: string;
}) {
	const content = params.content;

	const beginCount = countMatches(content, BEGIN_MARKER);
	const endCount = countMatches(content, END_MARKER);

	if (beginCount === 0 && endCount === 0) {
		return yield* Errors.markersMissing(
			params.path,
			'no `<!-- amdu:begin -->` / `<!-- amdu:end -->` markers found'
		);
	}
	if (beginCount > 1 || endCount > 1) {
		return yield* Errors.markersMissing(
			params.path,
			`expected exactly one begin/end marker, found ${beginCount} begin / ${endCount} end`
		);
	}
	if (beginCount !== endCount) {
		return yield* Errors.markersMissing(
			params.path,
			`mismatched markers: ${beginCount} begin / ${endCount} end`
		);
	}

	const beginIdx = content.indexOf(BEGIN_MARKER);
	const endIdx = content.indexOf(END_MARKER);

	if (beginIdx > endIdx) {
		return yield* Errors.markersMissing(
			params.path,
			'begin marker appears after end marker'
		);
	}

	const prelude = content.slice(0, beginIdx);
	const managed = content.slice(beginIdx + BEGIN_MARKER.length, endIdx);
	const postlude = content.slice(endIdx + END_MARKER.length);

	return { prelude, managed, postlude };
});

const joinImpl = (params: {
	readonly prelude: string;
	readonly newManagedBlock: string;
	readonly postlude: string;
}): Effect.Effect<string> =>
	Effect.succeed(
		`${params.prelude}${params.newManagedBlock}${params.postlude}`
	);

export const layer: Layer.Layer<Service, never, never> = Layer.succeed(
	Service,
	Service.of({ split: splitImpl, join: joinImpl })
);
