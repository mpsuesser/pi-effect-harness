import { Context, Effect, Layer } from 'effect';

import type { HarnessHook } from '../HarnessHook.ts';

export namespace HookSet {
	export interface Interface {
		readonly all: Effect.Effect<ReadonlyArray<HarnessHook.Any>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-harness/kernel/HookSet'
	) {}

	export const empty = Layer.succeed(
		Service,
		Service.of({ all: Effect.succeed([]) })
	);

	export const of = (hooks: ReadonlyArray<HarnessHook.Any>) =>
		Layer.succeed(Service, Service.of({ all: Effect.succeed(hooks) }));

	export const fromEffect = <E, R>(
		build: Effect.Effect<ReadonlyArray<HarnessHook.Any>, E, R>
	) => Layer.effect(
		Service,
		Effect.map(build, (hooks) => Service.of({ all: Effect.succeed(hooks) }))
	);
}
