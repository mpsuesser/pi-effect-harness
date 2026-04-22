/**
 * Schemas describing the closures / type declarations extracted from a
 * TypeScript source file by the `Extractor` service.
 *
 * A `ClosureRecord` is a deterministic, ts-morph-derived description of a
 * single top-level (or namespace-nested) declaration: its kind, its name,
 * its printed type signature, its JSDoc (raw inner text), and its source
 * line number. These are what the `Renderer` service consumes to produce
 * the deterministic block inside `AGENTS.md`.
 *
 * @since 0.1.0
 */

import * as Schema from 'effect/Schema';

// ───────────────────────────────────────────────────────────────────────────
// Kind tag (literal domain)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Discriminator for the underlying TS AST node kind that produced a
 * `ClosureRecord`.
 *
 * - `function`  — `function foo(...) {...}`
 * - `const`     — `const foo = ...` / `export const foo = ...` whose inferred
 *                 type has at least one call signature, or whose initializer
 *                 is an `ObjectLiteralExpression` / `as const` block
 * - `class`     — `class Foo extends ... {...}`, rendered as a flattened
 *                 members list ("extracted interface view")
 * - `interface` — `interface Foo {...}`
 * - `type`      — `type Foo = ...`
 * - `enum`      — `enum Foo {...}`
 * - `namespace` — `namespace Foo {...}` / `module Foo {...}`
 *
 * @category Models
 * @since 0.1.0
 */
export const ClosureKind = Schema.Literals([
	'function',
	'const',
	'class',
	'interface',
	'type',
	'enum',
	'namespace'
]);

/**
 * @category Types
 * @since 0.1.0
 */
export type ClosureKind = typeof ClosureKind.Type;

// ───────────────────────────────────────────────────────────────────────────
// ClosureRecord
// ───────────────────────────────────────────────────────────────────────────

/**
 * One extracted closure / declaration.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ClosureRecord extends Schema.Class<ClosureRecord>('ClosureRecord')(
	{
		/** Simple identifier — `make`, `ToolSpec`, `PiContext`, ... */
		name: Schema.String,
		/** AST kind discriminator — see {@link ClosureKind}. */
		kind: ClosureKind,
		/** Whether the declaration is exported from its containing scope. */
		exported: Schema.Boolean,
		/**
		 * The TypeScript signature as the ts-morph type printer would print
		 * it. For callables this is the full call signature including
		 * generics and return type (e.g. `Effect.Effect<A, E, R>`); for
		 * classes it is a flattened interface-style member listing; for
		 * types / interfaces / enums it is the declaration text with
		 * bodies preserved.
		 */
		signature: Schema.String,
		/**
		 * The concatenated inner text of all JSDoc comments attached to
		 * this declaration (or its enclosing `VariableStatement`, for
		 * `const` kind). Empty string if none.
		 */
		jsdoc: Schema.String,
		/**
		 * 1-based line number in the source file where this declaration
		 * begins. Used only for deterministic ordering.
		 */
		line: Schema.Int,
		/**
		 * Dotted path of the containing scope. Empty for top-level, or
		 * e.g. `MyNamespace.Inner` for a symbol nested two namespaces deep.
		 */
		scope: Schema.String
	},
	{
		description:
			'A single declaration extracted from a TypeScript source file.'
	}
) {}

// ───────────────────────────────────────────────────────────────────────────
// FileClosureSet
// ───────────────────────────────────────────────────────────────────────────

/**
 * The full set of closures extracted from one source file, along with the
 * file's project-root-relative path.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class FileClosureSet extends Schema.Class<FileClosureSet>(
	'FileClosureSet'
)(
	{
		/**
		 * Path relative to the project root (with forward slashes), e.g.
		 * `src/Tool.ts`.
		 */
		relativePath: Schema.String,
		/**
		 * Extracted closures in source order.
		 */
		closures: Schema.Array(ClosureRecord)
	},
	{
		description:
			'All closures extracted from one source file, in source order.'
	}
) {}
