import { testPattern } from './helpers/pattern-test-harness.ts';

testPattern({
	name: 'prefer-effect-fn',
	shouldMatch: [
		`export const layer = Layer.effect(Service, Effect.gen(function* () { const open = () => Effect.gen(function* () { return 1 }); return Service.of({ open }) }))`
	],
	shouldNotMatch: [
		`const program = Effect.gen(function* () { yield* Effect.log("hello") })`,
		`function doStuff() { return Effect.gen(function* () { return 42 }) }`,
		`Context.Service<MyService>()("MyService", { make: Effect.gen(function* () { return {} }) })`,
		`export const layer = Layer.effect(Service, Effect.gen(function* () { const open = Effect.fn('Helix.open')(function* () { return 1 }); return Service.of({ open }) }))`
	]
});
