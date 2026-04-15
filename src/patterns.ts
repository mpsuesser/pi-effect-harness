/**
 * Pattern Engine
 *
 * Loads, validates, and matches pattern definitions from markdown files
 * with YAML frontmatter. Patterns detect code smells and dangerous
 * commands based on regex or AST matching.
 *
 * This module is pure logic — no plugin hooks or session state.
 */

import { Lang, parse } from '@ast-grep/napi';
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Order from 'effect/Order';
import * as Schema from 'effect/Schema';
// @ts-expect-error no type declarations
import picomatch from 'picomatch';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { SKIPPED_FILES } from './constants.ts';
import { extractBody, parseFrontmatter } from './frontmatter.ts';

// ─── Schema Definitions ───────────────────────────────────────

const PatternEvent = Schema.Literals(['before', 'after'] as const);
type PatternEvent = typeof PatternEvent.Type;

const PatternAction = Schema.Literals(['context', 'ask', 'deny'] as const);
type PatternAction = typeof PatternAction.Type;

const PatternLevel = Schema.Literals(
	[
		'critical',
		'high',
		'medium',
		'warning',
		'info'
	] as const
);
type PatternLevel = typeof PatternLevel.Type;

const PatternDetector = Schema.Literals(['regex', 'ast'] as const);
type PatternDetector = typeof PatternDetector.Type;

const PatternFrontmatter = Schema.Struct({
	name: Schema.String,
	description: Schema.String.pipe(
		Schema.withDecodingDefault(Effect.succeed(''))
	),
	event: PatternEvent.pipe(
		Schema.withDecodingDefault(Effect.succeed('before' as const))
	),
	tool: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed('.*'))),
	glob: Schema.String.pipe(Schema.optionalKey),
	pattern: Schema.String,
	detector: PatternDetector.pipe(
		Schema.withDecodingDefault(Effect.succeed('regex' as const))
	),
	inside: Schema.String.pipe(Schema.optionalKey),
	action: PatternAction.pipe(
		Schema.withDecodingDefault(Effect.succeed('context' as const))
	),
	level: PatternLevel.pipe(
		Schema.withDecodingDefault(Effect.succeed('info' as const))
	),
	suggestSkills: Schema.Array(Schema.String).pipe(Schema.optionalKey),
	matchInComments: Schema.Boolean.pipe(
		Schema.withDecodingDefault(Effect.succeed(false))
	)
});

export interface PatternDefinition extends
	Readonly<
		typeof PatternFrontmatter.Type
	> {
	readonly body: string;
	readonly filePath: string;
}

// ─── Pure Helpers ─────────────────────────────────────────────

/**
 * Strip comment contents from source code so that regex patterns only
 * match against actual code, not prose in comments.
 *
 * Replaces comment contents with spaces (preserving newlines) so that
 * the resulting string maintains line structure. String literals are
 * intentionally preserved — many patterns match import specifiers,
 * tag comparisons, and other string content.
 *
 * Handles: // line comments and /​* block comments *​/. Correctly
 * ignores comment-start sequences inside string literals.
 */
export const stripComments = (source: string): string => {
	const len = source.length;
	const out: string[] = [];
	let i = 0;

	/** Read the character at position i (always in-bounds when called). */
	const at = (pos: number): string => source.charAt(pos);

	/** Copy source[i] into the output buffer. */
	const keep = (): void => {
		out.push(at(i));
		i++;
	};

	/** Replace source[i] with a space in the output. */
	const blank = (): void => {
		out.push(at(i) === '\n' ? '\n' : ' ');
		i++;
	};

	while (i < len) {
		const ch = at(i);
		const next = i + 1 < len ? at(i + 1) : '';

		// ── Skip string literals (preserve content) ───────────
		// Must be checked before comments so that // and /* inside
		// strings are not treated as comment starts.
		if (ch === "'" || ch === '"') {
			const quote = ch;
			keep(); // opening quote
			while (i < len && at(i) !== quote) {
				if (at(i) === '\\' && i + 1 < len) {
					keep();
					keep();
					continue;
				}
				keep();
			}
			if (i < len) keep(); // closing quote
			continue;
		}

		// ── Skip template literals (preserve content) ─────────
		if (ch === '`') {
			keep(); // opening backtick
			while (i < len && at(i) !== '`') {
				if (at(i) === '\\' && i + 1 < len) {
					keep();
					keep();
					continue;
				}
				keep();
			}
			if (i < len) keep(); // closing backtick
			continue;
		}

		// ── Single-line comment ───────────────────────────────
		if (ch === '/' && next === '/') {
			blank();
			blank();
			while (i < len && at(i) !== '\n') blank();
			continue;
		}

		// ── Block comment ─────────────────────────────────────
		if (ch === '/' && next === '*') {
			blank();
			blank();
			while (i < len) {
				if (at(i) === '*' && i + 1 < len && at(i + 1) === '/') {
					blank();
					blank();
					break;
				}
				blank();
			}
			continue;
		}

		// ── Regular code — keep as-is ─────────────────────────
		keep();
	}

	return out.join('');
};

const isSkippedFile = (filename: string): boolean =>
	SKIPPED_FILES.some(
		(prefix) =>
			filename.startsWith(prefix) ||
			filename.toLowerCase() === `${prefix.toLowerCase()}.md`
	);

const validateRegex = (pattern: string): boolean => {
	try {
		new RegExp(pattern);
		return true;
	} catch {
		return false;
	}
};

const testRegex = (text: string, pattern: string): boolean => {
	try {
		return new RegExp(pattern).test(text);
	} catch {
		return false;
	}
};

const testGlob = (filePath: string, glob: string): boolean => {
	try {
		return picomatch(glob)(filePath);
	} catch {
		return false;
	}
};

const langFromPath = (filePath: string | undefined): Lang | null => {
	if (!filePath) return null;
	if (filePath.endsWith('.tsx')) return Lang.Tsx;
	if (filePath.endsWith('.ts')) return Lang.TypeScript;
	if (filePath.endsWith('.jsx')) return Lang.Tsx;
	if (filePath.endsWith('.js')) return Lang.JavaScript;
	return null;
};

const testAst = (
	text: string,
	pattern: PatternDefinition,
	filePath: string | undefined
): boolean => {
	const lang = langFromPath(filePath);
	if (!lang) return false;

	try {
		const root = parse(lang, text).root();
		const nodes = pattern.inside
			? root.findAll({
				rule: {
					pattern: pattern.pattern,
					inside: {
						pattern: pattern.inside,
						stopBy: 'end'
					}
				}
			})
			: root.findAll(pattern.pattern);
		return nodes.length > 0;
	} catch {
		return false;
	}
};

// ─── Pattern Reading ──────────────────────────────────────────

const decodePattern = Schema.decodeUnknownOption(PatternFrontmatter);

const normalizeEvent = (event: string | undefined): 'before' | 'after' => {
	if (!event) return 'before';
	return event.toLowerCase() === 'after' ? 'after' : 'before';
};

const readPattern = (
	filePath: string,
	content: string
): PatternDefinition | null => {
	const raw = parseFrontmatter(content);
	if (!raw.name || !raw.pattern) return null;

	const normalized = {
		...raw,
		event: normalizeEvent(raw.event as string | undefined)
	};

	const result = decodePattern(normalized);
	if (Option.isNone(result)) return null;

	const fm = result.value;

	if (fm.detector !== 'ast' && !validateRegex(fm.pattern)) return null;
	if (fm.tool !== '.*' && !validateRegex(fm.tool)) return null;

	return {
		name: fm.name,
		description: fm.description,
		event: fm.event,
		tool: fm.tool,
		...(fm.glob !== undefined ? { glob: fm.glob } : {}),
		pattern: fm.pattern,
		detector: fm.detector,
		...(fm.inside !== undefined ? { inside: fm.inside } : {}),
		action: fm.action,
		level: fm.level,
		...(fm.suggestSkills !== undefined
			? { suggestSkills: fm.suggestSkills }
			: {}),
		matchInComments: fm.matchInComments,
		body: extractBody(content),
		filePath
	};
};

// ─── Pattern Loading ──────────────────────────────────────────

const walkPatternDir = (dir: string): PatternDefinition[] => {
	const results: PatternDefinition[] = [];
	let entries: string[];
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return results;
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}

		if (stat.isDirectory()) {
			results.push(...walkPatternDir(fullPath));
		} else if (entry.endsWith('.md') && !isSkippedFile(entry)) {
			let content: string;
			try {
				content = fs.readFileSync(fullPath, 'utf-8');
			} catch {
				continue;
			}
			const pattern = readPattern(fullPath, content);
			if (pattern) results.push(pattern);
		}
	}

	return results;
};

let cachedPatterns: PatternDefinition[] | null = null;

export const getPatterns = (): PatternDefinition[] => {
	if (cachedPatterns) return cachedPatterns;

	const dirname = import.meta.dirname ?? '.';
	const patternsDir = path.join(dirname, '..', 'patterns');

	try {
		cachedPatterns = fs.existsSync(patternsDir)
			? walkPatternDir(patternsDir)
			: [];
	} catch {
		cachedPatterns = [];
	}

	return cachedPatterns;
};

// ─── Pattern Matching ─────────────────────────────────────────

const contentFields = [
	'command',
	'newString',
	'content',
	'pattern',
	'query',
	'url',
	'prompt'
] as const;

const getMatchableContent = (input: Record<string, unknown>): string => {
	const parts: string[] = [];
	for (const field of contentFields) {
		if (typeof input[field] === 'string') {
			parts.push(input[field] as string);
		}
	}
	return parts.length > 0 ? parts.join('\n') : JSON.stringify(input);
};

const getFilePath = (input: Record<string, unknown>): string | undefined => {
	const fp = input.filePath;
	return typeof fp === 'string' ? fp : undefined;
};

export const matches = (
	toolName: string,
	args: Record<string, unknown>,
	eventType: 'before' | 'after',
	pattern: PatternDefinition
): boolean => {
	const filePath = getFilePath(args);
	const content = getMatchableContent(args);

	const globMatches = pattern.glob
		? filePath !== undefined && testGlob(filePath, pattern.glob)
		: true;

	if (
		pattern.event !== eventType ||
		!testRegex(toolName, pattern.tool) ||
		!globMatches
	) {
		return false;
	}

	if (pattern.detector === 'ast') {
		return testAst(content, pattern, filePath);
	}

	// Strip comments so regex patterns only match actual code, not
	// prose in comments. Patterns with matchInComments opt out.
	const matchable = pattern.matchInComments
		? content
		: stripComments(content);
	return testRegex(matchable, pattern.pattern);
};

// ─── Sorting & Formatting ─────────────────────────────────────

const levelPriority: Record<PatternLevel, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	warning: 3,
	info: 4
};

const PatternLevelOrder = Order.mapInput(
	Order.Number,
	(p: PatternDefinition) => levelPriority[p.level]
);

export const sortByLevel = (
	patterns: PatternDefinition[]
): PatternDefinition[] => Arr.sort(patterns, PatternLevelOrder);

export const bodyWithSkillHints = (p: PatternDefinition): string => {
	if (p.suggestSkills === undefined || p.suggestSkills.length === 0) {
		return p.body;
	}
	const hints = p.suggestSkills
		.map(
			(skill) =>
				`If you have not loaded the \`${skill}\` skill, you should load it before continuing.`
		)
		.join('\n');
	return `${p.body}\n\n${hints}`;
};
