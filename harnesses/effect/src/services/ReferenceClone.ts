import { Context, Effect, Layer, Schema } from 'effect';

import { ensureReferenceClone } from '../functions/ensureReferenceClone.ts';

class ReferenceCloneFailed
	extends Schema.TaggedErrorClass<ReferenceCloneFailed>()(
		'ReferenceCloneFailed',
		{
			message: Schema.String
		}
	) {}

export namespace ReferenceClone {
	export interface Interface {
		readonly ensure: () => Effect.Effect<void>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-harness/effect/ReferenceClone'
	) {}

	export const layer = Layer.succeed(
		Service,
		Service.of({
			ensure: Effect.fn('ReferenceClone.ensure')(function*() {
				yield* Effect.tryPromise({
					try: () => ensureReferenceClone(),
					catch: () =>
						new ReferenceCloneFailed({
							message: 'Reference clone failed'
						})
				}).pipe(Effect.catch(() => Effect.void));
			})
		})
	);
}
