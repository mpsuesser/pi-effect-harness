/**
 * agentsmd-undriftable — deterministic AGENTS.md generator.
 *
 * Procedurally walks every TypeScript source file in a package via
 * ts-morph, extracts every top-level closure / type surface (functions,
 * callable consts, classes, interfaces, type aliases, enums, and
 * namespaces — recursively), and renders the result as a fenced block
 * inside `AGENTS.md`. The fenced block is regenerated deterministically
 * by `amdu sync`; prose above and below the markers is preserved across
 * runs.
 *
 * @since 0.1.0
 */

export * as AgentsMdMerger from './AgentsMdMerger.ts';
export * as Closure from './Closure.ts';
export * as Drift from './Drift.ts';
export * as Errors from './Errors.ts';
export * as Extractor from './Extractor.ts';
export * as Generator from './Generator.ts';
export * as Renderer from './Renderer.ts';
export * as TsMorphProject from './TsMorphProject.ts';
