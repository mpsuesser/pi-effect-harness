import { Context, Effect, Layer, Ref } from 'effect';

export namespace ModeState {
	export interface Interface {
		readonly isEnabled: Effect.Effect<boolean>;
		readonly setEnabled: (enabled: boolean) => Effect.Effect<void>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/mode/ModeState'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const enabled = yield* Ref.make(false);
			const isEnabled = Ref.get(enabled);
			const setEnabled = Effect.fn('ModeState.setEnabled')(function*(
				nextEnabled: boolean
			) {
				yield* Ref.set(enabled, nextEnabled);
			});

			return Service.of({ isEnabled, setEnabled });
		})
	);
}
