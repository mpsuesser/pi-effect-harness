/**
 * Extractor — walks a `ts-morph` `SourceFile` and produces a deterministic
 * `FileClosureSet`: every top-level declaration (functions, callable
 * consts, classes, interfaces, type aliases, enums, and namespaces),
 * recursively into namespaces, in source order.
 *
 * This is the core of the `amdu` pipeline — the piece that makes the
 * procedural AGENTS.md generation deterministic. All choices about "how do
 * we render the signature" are concentrated in this module; the rest of
 * the pipeline only consumes `ClosureRecord`s.
 *
 * Signature rendering rules (matching the plan agreed with the user):
 * - callables (`function`, `const` w/ call signatures):
 *   `.getType().getText(node, NoTruncation | UseAliasDefinedOutsideCurrentScope)`
 * - classes: flattened "extracted interface" view — class declaration line
 *   (keyword + name + generics + heritage) followed by each instance and
 *   static member's printed signature
 * - `interface` / `type` / `enum`: declaration text, with interface/enum
 *   bodies preserved verbatim (they are already type-only)
 * - `namespace`: header line only; members are emitted as their own
 *   records with `scope` set to the containing namespace's dotted path
 *
 * @since 0.1.0
 */

import { Context, Effect, Layer } from 'effect';
import * as Arr from 'effect/Array';
import {
	ClassDeclaration,
	EnumDeclaration,
	FunctionDeclaration,
	InterfaceDeclaration,
	type JSDocableNode,
	ModuleDeclaration,
	Node,
	type SourceFile,
	SyntaxKind,
	type Type,
	TypeAliasDeclaration,
	TypeFormatFlags,
	VariableDeclaration,
	VariableStatement
} from 'ts-morph';

import { ClosureRecord, FileClosureSet } from './Closure.ts';

// ───────────────────────────────────────────────────────────────────────────
// Service
// ───────────────────────────────────────────────────────────────────────────

/**
 * Capability surface of {@link Service}.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Interface {
	/**
	 * Walk the given source file and produce the full set of extracted
	 * closures, keyed by a project-root-relative path (supplied by the
	 * caller so this service does not need a project root itself).
	 */
	readonly extract: (params: {
		readonly sourceFile: SourceFile;
		readonly relativePath: string;
	}) => Effect.Effect<FileClosureSet>;
}

/**
 * The `Extractor` service identity.
 *
 * @category Service
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
	'agentsmd-undriftable/Extractor'
) {}

// ───────────────────────────────────────────────────────────────────────────
// Type printing
// ───────────────────────────────────────────────────────────────────────────

const typeFormatFlags = TypeFormatFlags.NoTruncation |
	TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
	TypeFormatFlags.WriteArrayAsGenericType;

const typeText = (type: Type, enclosing: Node): string =>
	type.getText(enclosing, typeFormatFlags);

// ───────────────────────────────────────────────────────────────────────────
// JSDoc helpers
// ───────────────────────────────────────────────────────────────────────────

// ts-morph attaches every leading JSDoc block to the next declaration,
// which means file-level `/** ... */` comments get picked up by the first
// statement in the file. Take only the last JSDoc — by convention the
// one directly attached to the declaration.
const jsDocText = (node: JSDocableNode): string =>
	Arr.match(node.getJsDocs(), {
		onEmpty: () => '',
		onNonEmpty: (xs) => Arr.lastNonEmpty(xs).getInnerText()
	});

// ───────────────────────────────────────────────────────────────────────────
// Per-kind signature rendering
// ───────────────────────────────────────────────────────────────────────────

const renderFunctionSignature = (fn: FunctionDeclaration): string => {
	const name = fn.getName() ?? '<anonymous>';
	return `function ${name}${typeText(fn.getType(), fn)}`;
};

const renderConstSignature = (decl: VariableDeclaration): string => {
	const name = decl.getName();
	const signature = typeText(decl.getType(), decl);
	return `const ${name}: ${signature}`;
};

const renderMember = (prefix: string, member: Node): string => {
	const nameText = Node.hasName(member) ? member.getName() : '<unnamed>';
	const signature = typeText(member.getType(), member);
	return `  ${prefix}${nameText}: ${signature};`;
};

const renderClassSignature = (cls: ClassDeclaration): string => {
	const nameNode = cls.getNameNode();
	const name = nameNode !== undefined ? nameNode.getText() : '<anonymous>';

	const generics = Arr.match(cls.getTypeParameters(), {
		onEmpty: () => '',
		onNonEmpty: (xs) => `<${xs.map((tp) => tp.getText()).join(', ')}>`
	});

	const extendsNode = cls.getExtends();
	const extendsClause = extendsNode === undefined
		? ''
		: ` extends ${extendsNode.getText()}`;

	const implementsClause = Arr.match(cls.getImplements(), {
		onEmpty: () => '',
		onNonEmpty: (xs) =>
			` implements ${xs.map((impl) => impl.getText()).join(', ')}`
	});

	const header =
		`class ${name}${generics}${extendsClause}${implementsClause}`;

	const staticLines = Arr.map(
		cls.getStaticMembers(),
		(member) => renderMember('static ', member)
	);
	const instanceLines = Arr.map(
		cls.getInstanceMembers(),
		(member) => renderMember('', member)
	);

	return [`${header} {`, ...staticLines, ...instanceLines, '}'].join('\n');
};

const renderInterfaceSignature = (decl: InterfaceDeclaration): string => {
	// Interfaces are already type-only; print the full declaration text,
	// stripped of leading modifiers (export, etc.) so rendering is uniform.
	const text = decl.getText();
	return text.trimStart();
};

const renderTypeAliasSignature = (decl: TypeAliasDeclaration): string =>
	decl.getText().trimStart();

const renderEnumSignature = (decl: EnumDeclaration): string =>
	decl.getText().trimStart();

const renderNamespaceSignature = (decl: ModuleDeclaration): string => {
	const name = decl.getName();
	const keyword = decl.hasNamespaceKeyword() ? 'namespace' : 'module';
	return `${keyword} ${name} { /* ... */ }`;
};

// ───────────────────────────────────────────────────────────────────────────
// VariableStatement → records
// ───────────────────────────────────────────────────────────────────────────

const isClosureLikeVariable = (decl: VariableDeclaration): boolean => {
	const type = decl.getType();
	if (type.getCallSignatures().length > 0) {
		return true;
	}
	// object-literal / as-const factories (e.g. `export const Tool = { make } as const`)
	const initializer = decl.getInitializer();
	if (initializer === undefined) {
		return false;
	}
	const kind = initializer.getKind();
	return (
		kind === SyntaxKind.ObjectLiteralExpression ||
		kind === SyntaxKind.AsExpression
	);
};

const recordsFromVariableStatement = (
	statement: VariableStatement,
	scope: string
): ReadonlyArray<ClosureRecord> => {
	const jsdoc = jsDocText(statement);
	const exported = statement.isExported();
	return Arr.flatMap(
		statement.getDeclarations(),
		(decl) =>
			isClosureLikeVariable(decl)
				? [
					new ClosureRecord({
						name: decl.getName(),
						kind: 'const',
						exported,
						signature: renderConstSignature(decl),
						jsdoc,
						line: decl.getStartLineNumber(),
						scope
					})
				]
				: []
	);
};

// ───────────────────────────────────────────────────────────────────────────
// Statement → records (flat, for a single scope)
// ───────────────────────────────────────────────────────────────────────────

type Container = SourceFile | ModuleDeclaration;

const makeRecord = (params: {
	readonly name: string;
	readonly kind: ClosureRecord['kind'];
	readonly exported: boolean;
	readonly signature: string;
	readonly jsdoc: string;
	readonly line: number;
	readonly scope: string;
}): ClosureRecord => new ClosureRecord(params);

const classifyStatement = (
	statement: ReturnType<Container['getStatements']>[number],
	scope: string
): ReadonlyArray<ClosureRecord> => {
	if (statement instanceof VariableStatement) {
		return recordsFromVariableStatement(statement, scope);
	}
	if (statement instanceof FunctionDeclaration) {
		const name = statement.getName();
		return name === undefined
			? []
			: [
				makeRecord({
					name,
					kind: 'function',
					exported: statement.isExported(),
					signature: renderFunctionSignature(statement),
					jsdoc: jsDocText(statement),
					line: statement.getStartLineNumber(),
					scope
				})
			];
	}
	if (statement instanceof ClassDeclaration) {
		const name = statement.getName();
		return name === undefined
			? []
			: [
				makeRecord({
					name,
					kind: 'class',
					exported: statement.isExported(),
					signature: renderClassSignature(statement),
					jsdoc: jsDocText(statement),
					line: statement.getStartLineNumber(),
					scope
				})
			];
	}
	if (statement instanceof InterfaceDeclaration) {
		return [
			makeRecord({
				name: statement.getName(),
				kind: 'interface',
				exported: statement.isExported(),
				signature: renderInterfaceSignature(statement),
				jsdoc: jsDocText(statement),
				line: statement.getStartLineNumber(),
				scope
			})
		];
	}
	if (statement instanceof TypeAliasDeclaration) {
		return [
			makeRecord({
				name: statement.getName(),
				kind: 'type',
				exported: statement.isExported(),
				signature: renderTypeAliasSignature(statement),
				jsdoc: jsDocText(statement),
				line: statement.getStartLineNumber(),
				scope
			})
		];
	}
	if (statement instanceof EnumDeclaration) {
		return [
			makeRecord({
				name: statement.getName(),
				kind: 'enum',
				exported: statement.isExported(),
				signature: renderEnumSignature(statement),
				jsdoc: jsDocText(statement),
				line: statement.getStartLineNumber(),
				scope
			})
		];
	}
	if (statement instanceof ModuleDeclaration) {
		const name = statement.getName();
		const nestedScope = scope.length === 0 ? name : `${scope}.${name}`;
		return [
			makeRecord({
				name,
				kind: 'namespace',
				exported: statement.isExported(),
				signature: renderNamespaceSignature(statement),
				jsdoc: jsDocText(statement),
				line: statement.getStartLineNumber(),
				scope
			}),
			...recordsFromContainer(statement, nestedScope)
		];
	}
	return [];
};

const recordsFromContainer = (
	container: Container,
	scope: string
): ReadonlyArray<ClosureRecord> =>
	Arr.flatMap(
		container.getStatements(),
		(statement) => classifyStatement(statement, scope)
	);

// ───────────────────────────────────────────────────────────────────────────
// Layer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Layer providing the default {@link Service} implementation.
 *
 * @category Layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<Service, never, never> = Layer.succeed(
	Service,
	Service.of({
		extract: (params: {
			readonly sourceFile: SourceFile;
			readonly relativePath: string;
		}) =>
			Effect.sync(
				() =>
					new FileClosureSet({
						relativePath: params.relativePath,
						closures: recordsFromContainer(params.sourceFile, '')
					})
			)
	})
);
