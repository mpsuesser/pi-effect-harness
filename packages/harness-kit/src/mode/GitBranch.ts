import { Context, Effect, Layer } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const emptyString = '';

const commandOutput = (
	spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
	cwd: string,
	args: ReadonlyArray<string>
) => spawner
	.string(
		ChildProcess.make('git', args, {
			cwd,
			extendEnv: true,
			stdin: 'ignore'
		})
	)
	.pipe(
		Effect.map((output) => output.trim()),
		Effect.catchTag('PlatformError', () => Effect.succeed(emptyString))
	);

export namespace GitBranch {
	export interface Interface {
		readonly get: (cwd: string) => Effect.Effect<string | undefined>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/mode/GitBranch'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
			const get = Effect.fn('GitBranch.get')(function*(cwd: string) {
				const branch = yield* commandOutput(spawner, cwd, [
					'branch',
					'--show-current'
				]);
				if (branch.length > 0) {
					return branch;
				}

				const detachedHead = yield* commandOutput(spawner, cwd, [
					'rev-parse',
					'--short',
					'HEAD'
				]);
				return detachedHead.length > 0
					? `detached-${detachedHead}`
					: undefined;
			});

			return Service.of({ get });
		})
	);
}
