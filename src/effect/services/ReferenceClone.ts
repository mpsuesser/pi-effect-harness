import { Context, Effect, Layer, Schema } from 'effect';

import { ensureReferenceClone } from '../../functions/ensureReferenceClone.ts';

class ReferenceCloneFailed
	extends Schema.TaggedErrorClass<ReferenceCloneFailed>()(
		'ReferenceCloneFailed',
		{
			message: Schema.String
		}
	) {}

export namespace ReferenceClone {
	export interface Interface {
		readonly ensure: (
			cwd: string,
			version: string
		) => Effect.Effect<void>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-enforcer/effect/ReferenceClone'
	) {}

	export const layer = Layer.succeed(
		Service,
		Service.of({
			ensure: Effect.fn('ReferenceClone.ensure')(function*(
				cwd: string,
				version: string
			) {
				yield* Effect.tryPromise({
					try: () => ensureReferenceClone(cwd, version),
					catch: () =>
						new ReferenceCloneFailed({
							message: 'Reference clone failed'
						})
				}).pipe(Effect.catch(() => Effect.void));
			})
		})
	);
}
