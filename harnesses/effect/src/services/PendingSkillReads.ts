import { Context, Effect, Layer, Ref } from 'effect';

const uniqueValues = (
	values: ReadonlyArray<string>
): ReadonlyArray<string> => [...new Set(values)];

export namespace PendingSkillReads {
	export interface Interface {
		readonly clear: Effect.Effect<void>;
		readonly remember: (
			toolCallId: string,
			skillName: string
		) => Effect.Effect<void>;
		readonly take: (
			toolCallId: string
		) => Effect.Effect<string | undefined>;
		readonly names: Effect.Effect<ReadonlyArray<string>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-harness/effect/PendingSkillReads'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const reads = yield* Ref.make(new Map<string, string>());
			const clear = Ref.set(reads, new Map<string, string>());
			const remember = Effect.fn('PendingSkillReads.remember')(function*(
				toolCallId: string,
				skillName: string
			) {
				yield* Ref.update(
					reads,
					(current) => new Map(current).set(toolCallId, skillName)
				);
			});
			const take = Effect.fn('PendingSkillReads.take')(function*(
				toolCallId: string
			) {
				const current = yield* Ref.get(reads);
				const value = current.get(toolCallId);
				yield* Ref.set(
					reads,
					new Map(
						[...current.entries()].filter(
							([currentToolCallId]) =>
								currentToolCallId !== toolCallId
						)
					)
				);
				return value;
			});
			const names = Ref.get(reads).pipe(
				Effect.map((current) => uniqueValues([...current.values()]))
			);

			return Service.of({ clear, remember, take, names });
		})
	);
}
