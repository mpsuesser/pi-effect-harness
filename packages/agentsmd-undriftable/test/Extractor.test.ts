import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Project } from 'ts-morph';

import type { ClosureKind } from '../src/Closure.ts';
import * as Extractor from '../src/Extractor.ts';

const makeProject = (source: string) => {
	const project = new Project({ useInMemoryFileSystem: true });
	return project.createSourceFile('src/Example.ts', source);
};

const extract = (source: string) =>
	Effect.gen(function*() {
		const extractor = yield* Extractor.Service;
		const sourceFile = makeProject(source);
		return yield* extractor.extract({
			sourceFile,
			relativePath: 'src/Example.ts'
		});
	}).pipe(Effect.provide(Extractor.layer));

const byName = <T extends { readonly name: string; }>(
	xs: ReadonlyArray<T>,
	name: string
): T | undefined => xs.find((x) => x.name === name);

describe('Extractor', () => {
	it.effect('extracts exported function declarations with inferred return type', () =>
		Effect.gen(function*() {
			const result = yield* extract(
				`/**\n * Returns the ultimate answer.\n */\nexport function answer() {\n  return 42;\n}\n`
			);
			const closure = byName(result.closures, 'answer');
			assert.isDefined(closure);
			assert.strictEqual(closure?.kind, 'function' satisfies ClosureKind);
			assert.strictEqual(closure?.exported, true);
			assert.include(closure?.signature ?? '', 'function answer');
			assert.include(closure?.signature ?? '', '=> number');
			assert.include(closure?.jsdoc ?? '', 'Returns the ultimate answer');
		}));

	it.effect('extracts non-exported function declarations too', () =>
		Effect.gen(function*() {
			const result = yield* extract(
				`function secret() {\n  return 'shh';\n}\n`
			);
			const closure = byName(result.closures, 'secret');
			assert.isDefined(closure);
			assert.strictEqual(closure?.exported, false);
		}));

	it.effect('extracts callable const declarations (arrow functions)', () =>
		Effect.gen(function*() {
			const result = yield* extract(
				`/** Doubles a number. */\nexport const double = (n: number): number => n * 2;\n`
			);
			const closure = byName(result.closures, 'double');
			assert.isDefined(closure);
			assert.strictEqual(closure?.kind, 'const' satisfies ClosureKind);
			assert.include(closure?.signature ?? '', '(n: number) => number');
			assert.include(closure?.jsdoc ?? '', 'Doubles a number');
		}));

	it.effect('skips non-callable const that is a plain primitive', () =>
		Effect.gen(function*() {
			const result = yield* extract(`export const pi = 3.14;\n`);
			assert.isUndefined(byName(result.closures, 'pi'));
		}));

	it.effect('extracts object-literal `as const` exports', () =>
		Effect.gen(function*() {
			const result = yield* extract(
				`const make = () => 1;\nexport const Tool = { make } as const;\n`
			);
			assert.isDefined(byName(result.closures, 'Tool'));
		}));

	it.effect('extracts interface declarations preserving their body', () =>
		Effect.gen(function*() {
			const result = yield* extract(
				`/** An interface. */\nexport interface Foo { readonly a: string; readonly b: number; }\n`
			);
			const closure = byName(result.closures, 'Foo');
			assert.isDefined(closure);
			assert.strictEqual(
				closure?.kind,
				'interface' satisfies ClosureKind
			);
			assert.include(closure?.signature ?? '', 'interface Foo');
			assert.include(closure?.signature ?? '', 'readonly a: string');
		}));

	it.effect('extracts type alias declarations', () =>
		Effect.gen(function*() {
			const result = yield* extract(`export type Id = string;\n`);
			const closure = byName(result.closures, 'Id');
			assert.isDefined(closure);
			assert.strictEqual(closure?.kind, 'type' satisfies ClosureKind);
		}));

	it.effect('recurses into namespaces with scope', () =>
		Effect.gen(function*() {
			const result = yield* extract(
				`export namespace Outer {\n  export function inner() { return 1; }\n  export namespace Deep {\n    export const x = () => 2;\n  }\n}\n`
			);
			assert.isDefined(
				result.closures.find((c) =>
					c.name === 'Outer' && c.scope === ''
				)
			);
			assert.isDefined(
				result.closures.find((c) =>
					c.name === 'inner' && c.scope === 'Outer'
				)
			);
			assert.isDefined(
				result.closures.find((c) =>
					c.name === 'Deep' && c.scope === 'Outer'
				)
			);
			assert.isDefined(
				result.closures.find((c) =>
					c.name === 'x' && c.scope === 'Outer.Deep'
				)
			);
		}));

	it.effect('preserves source order across kinds', () =>
		Effect.gen(function*() {
			const result = yield* extract(
				`export const a = () => 1;\nexport function b() { return 2; }\nexport interface C { readonly v: number; }\n`
			);
			const names = result.closures.map((c) => c.name);
			assert.deepStrictEqual(names, ['a', 'b', 'C']);
		}));

	it.effect(
		'takes only the last JSDoc (file-level comments do not leak onto the first declaration)',
		() =>
			Effect.gen(function*() {
				const result = yield* extract(
					`/**\n * File-level module description. Should NOT attach to \`foo\`.\n */\n\n/**\n * Directly attached JSDoc for \`foo\`.\n */\nexport const foo = () => 1;\n`
				);
				const closure = byName(result.closures, 'foo');
				assert.isDefined(closure);
				assert.include(
					closure?.jsdoc ?? '',
					'Directly attached JSDoc'
				);
				assert.notInclude(
					closure?.jsdoc ?? '',
					'File-level module description'
				);
			})
	);
});
