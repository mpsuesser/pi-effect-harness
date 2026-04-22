/**
 * Drift — thin Effect wrapper around the `drift` CLI. Currently supports
 * only `drift link <agents-md-path> <target-path>`, which is all `amdu`
 * needs (one file-level anchor per source file, per the design agreed
 * with the user).
 *
 * Spawning is provided by `ChildProcessSpawner` from
 * `effect/unstable/process`, keeping this service portable across Node
 * and Bun platforms.
 *
 * @since 0.1.0
 */

import { Context, Effect, Layer, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import * as Errors from './Errors.ts';

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
	 * Run `drift link <agentsMdPath> <targetPath>` and return when the
	 * process exits cleanly. Fails with `DriftNotFound` if the `drift`
	 * binary is not on PATH, or `DriftFailure` if `drift` itself exits
	 * non-zero.
	 *
	 * Both paths are interpreted by `drift` relative to the repository
	 * root, exactly as they would be on the command line.
	 */
	readonly link: (params: {
		readonly cwd: string;
		readonly agentsMdPath: string;
		readonly targetPath: string;
	}) => Effect.Effect<void, Errors.AmduError>;
}

/**
 * The `Drift` service identity.
 *
 * @category Service
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
	'agentsmd-undriftable/Drift'
) {}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const BIN = 'drift';

const collectText = <E, R>(
	stream: Stream.Stream<Uint8Array, E, R>
): Effect.Effect<string, E, R> =>
	stream.pipe(Stream.decodeText(), Stream.mkString);

// ───────────────────────────────────────────────────────────────────────────
// Layer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Layer providing the default {@link Service} implementation. Requires a
 * `ChildProcessSpawner` in context (supplied by either
 * `NodeServices.layer` or `BunServices.layer`).
 *
 * @category Layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<
	Service,
	never,
	ChildProcessSpawner.ChildProcessSpawner
> = Layer.effect(
	Service,
	Effect.gen(function*() {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

		const link = Effect.fn('Drift.link')(function*(params: {
			readonly cwd: string;
			readonly agentsMdPath: string;
			readonly targetPath: string;
		}) {
			// `amdu sync` regenerates the managed block from the source files
			// themselves, so by the time we run `drift link` the doc is
			// definitionally accurate. Passing `--doc-is-still-accurate` is
			// the contract that lets drift restamp without prompting.
			const argv = [
				'link',
				params.agentsMdPath,
				params.targetPath,
				'--doc-is-still-accurate'
			];
			const command = ChildProcess.make(BIN, argv, {
				cwd: params.cwd,
				stdin: 'ignore'
			});

			const result = yield* Effect.gen(function*() {
				const handle = yield* spawner.spawn(command).pipe(
					Effect.mapError((cause) => Errors.driftNotFound(cause))
				);
				const [stderr, exitCode] = yield* Effect.all(
					[collectText(handle.stderr), handle.exitCode],
					{ concurrency: 'unbounded' }
				).pipe(
					Effect.mapError((cause) => Errors.driftNotFound(cause))
				);
				return { stderr, exitCode };
			}).pipe(Effect.scoped);

			if (result.exitCode !== 0) {
				return yield* Errors.driftFailure({
					argv,
					exitCode: result.exitCode,
					stderr: result.stderr
				});
			}
		});

		return Service.of({ link });
	})
);
