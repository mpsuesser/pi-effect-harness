import { Context, Effect, Layer, Ref } from 'effect';

import { DEFAULT_VERSION } from '../constants.ts';
import { detectEffectVersion } from '../functions/detectEffectVersion.ts';

export namespace EffectVersion {
	export interface Interface {
		readonly get: Effect.Effect<string>;
		readonly refresh: (cwd: string) => Effect.Effect<string>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-enforcer/effect/EffectVersion'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const current = yield* Ref.make(DEFAULT_VERSION);

			const get = Ref.get(current);
			const refresh = Effect.fn('EffectVersion.refresh')(function*(
				cwd: string
			) {
				const version = detectEffectVersion(cwd);
				yield* Ref.set(current, version);
				return version;
			});

			return Service.of({ get, refresh });
		})
	);
}
