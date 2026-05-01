import { Context, Effect, Layer } from 'effect';

import type { HarnessRule } from '../HarnessRule.ts';

export namespace RuleSet {
	export interface Interface {
		readonly all: Effect.Effect<ReadonlyArray<HarnessRule.Any>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-harness/kernel/RuleSet'
	) {}

	export const empty = Layer.succeed(
		Service,
		Service.of({ all: Effect.succeed([]) })
	);

	export const of = (rules: ReadonlyArray<HarnessRule.Any>) =>
		Layer.succeed(Service, Service.of({ all: Effect.succeed(rules) }));

	export const fromEffect = <E, R>(
		build: Effect.Effect<ReadonlyArray<HarnessRule.Any>, E, R>
	) => Layer.effect(
		Service,
		Effect.map(build, (rules) => Service.of({ all: Effect.succeed(rules) }))
	);
}
