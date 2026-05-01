#!/usr/bin/env bun
/**
 * Build a publishable copy of `pi-effect-harness` with the `pi-harness-kit`
 * kernel inlined under `src/_kernel/`.
 *
 * The workspace dependency `pi-harness-kit` is not (and is not intended to be)
 * a published npm artifact. To ship a self-contained `pi-effect-harness`
 * tarball, this script materializes a publish-ready copy at
 * `harnesses/effect/dist/`:
 *
 *   - copies harness `src/` → `dist/src/`
 *   - copies kernel `src/`  → `dist/src/_kernel/`
 *   - rewrites every `from 'pi-harness-kit/X.ts'` import in `dist/src/`
 *     to a relative path pointing at `dist/src/_kernel/X.ts`
 *   - copies skills/, patterns/, guidance/, plus README.md & LICENSE from
 *     the workspace root
 *   - writes a `dist/package.json` with `pi-harness-kit` removed from
 *     `dependencies`, inlined kernel runtime dependencies merged in, and
 *     the dev/script fields stripped
 *
 * Run from the workspace root:
 *
 *   bun run build:publishable
 *
 * Then publish from inside the dist directory:
 *
 *   cd harnesses/effect/dist && bun publish --access public
 *
 * This script intentionally uses raw `node:fs` rather than Effect — it is
 * meta-tooling that runs outside any harness runtime.
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

const WORKSPACE_ROOT = new URL('..', import.meta.url).pathname;
const HARNESS_DIR = join(WORKSPACE_ROOT, 'harnesses/effect');
const KERNEL_DIR = join(WORKSPACE_ROOT, 'packages/harness-kit');
const KERNEL_SRC = join(KERNEL_DIR, 'src');
const KERNEL_PACKAGE_JSON = join(KERNEL_DIR, 'package.json');

const DIST_DIR = join(HARNESS_DIR, 'dist');
const DIST_SRC = join(DIST_DIR, 'src');
const DIST_KERNEL = join(DIST_SRC, '_kernel');

const KERNEL_PKG_NAME = 'pi-harness-kit';
const STATIC_SUBDIRS = ['skills', 'patterns', 'guidance'] as const;
const ROOT_FILES = ['README.md', 'LICENSE'] as const;

const log = (msg: string) => console.log(`[build-publishable] ${msg}`);

const importRegex = /from\s+(['"])pi-harness-kit\/([^'"]+)\1/g;

async function* walkTsFiles(
	dir: string,
	excludeDirs: ReadonlyArray<string>
): AsyncGenerator<string> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (excludeDirs.includes(fullPath)) continue;
		if (entry.isDirectory()) {
			yield* walkTsFiles(fullPath, excludeDirs);
		} else if (
			entry.isFile() &&
			(entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
		) {
			yield fullPath;
		}
	}
}

function specifierToKernel(fromFile: string): string {
	const fromDir = dirname(fromFile);
	const rel = relative(fromDir, DIST_KERNEL).split(sep).join('/');
	return rel.startsWith('.') ? rel : `./${rel}`;
}

async function rewriteImportsInFile(file: string): Promise<boolean> {
	const content = await readFile(file, 'utf8');
	if (!content.includes(KERNEL_PKG_NAME)) return false;

	const kernelSpec = specifierToKernel(file);
	let changed = false;
	const updated = content.replace(
		importRegex,
		(_match, quote: string, sub: string) => {
			changed = true;
			return `from ${quote}${kernelSpec}/${sub}${quote}`;
		}
	);
	if (changed) {
		await writeFile(file, updated);
	}
	return changed;
}

async function copyTree(src: string, dst: string): Promise<void> {
	await cp(src, dst, { recursive: true });
}

async function copyOptional(src: string, dst: string): Promise<boolean> {
	if (!existsSync(src)) return false;
	await cp(src, dst);
	return true;
}

interface PublishedPackageJson {
	scripts?: unknown;
	devDependencies?: unknown;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	[key: string]: unknown;
}

interface WorkspacePackageJson {
	catalog?: Record<string, string>;
}

const CATALOG_PROTOCOL = 'catalog:';

async function loadWorkspaceCatalog(): Promise<Record<string, string>> {
	const pkg: WorkspacePackageJson = JSON.parse(
		await readFile(join(WORKSPACE_ROOT, 'package.json'), 'utf8')
	);
	return pkg.catalog ?? {};
}

function resolveCatalogProtocol(
	deps: Record<string, string> | undefined,
	catalog: Record<string, string>
): Record<string, string> | undefined {
	if (deps === undefined) return undefined;
	const out: Record<string, string> = {};
	for (const [name, range] of Object.entries(deps)) {
		if (range !== CATALOG_PROTOCOL) {
			out[name] = range;
			continue;
		}
		const resolved = catalog[name];
		if (resolved === undefined) {
			throw new Error(
				`dependency '${name}' uses 'catalog:' but no entry exists in workspace catalog`
			);
		}
		out[name] = resolved;
	}
	return Object.keys(out).length === 0 ? undefined : out;
}

function withoutKernelDependency(
	deps: Record<string, string> | undefined
): Record<string, string> | undefined {
	if (deps === undefined) return undefined;
	const out = { ...deps };
	delete out[KERNEL_PKG_NAME];
	return Object.keys(out).length === 0 ? undefined : out;
}

function mergeDependencyRecords(
	...records: ReadonlyArray<Record<string, string> | undefined>
): Record<string, string> | undefined {
	const out: Record<string, string> = {};
	for (const record of records) {
		if (record === undefined) continue;
		Object.assign(out, record);
	}
	return Object.keys(out).length === 0 ? undefined : out;
}

async function writeDistPackageJson(): Promise<void> {
	const sourcePath = join(HARNESS_DIR, 'package.json');
	const pkg: PublishedPackageJson = JSON.parse(
		await readFile(sourcePath, 'utf8')
	);
	const kernelPkg: PublishedPackageJson = JSON.parse(
		await readFile(KERNEL_PACKAGE_JSON, 'utf8')
	);
	const catalog = await loadWorkspaceCatalog();

	pkg.dependencies = resolveCatalogProtocol(
		mergeDependencyRecords(
			kernelPkg.dependencies,
			withoutKernelDependency(pkg.dependencies)
		),
		catalog
	);
	pkg.peerDependencies = resolveCatalogProtocol(
		mergeDependencyRecords(
			kernelPkg.peerDependencies,
			pkg.peerDependencies
		),
		catalog
	);
	delete pkg.scripts;
	delete pkg.devDependencies;

	await writeFile(
		join(DIST_DIR, 'package.json'),
		`${JSON.stringify(pkg, null, 2)}\n`
	);
}

async function buildPublishable(): Promise<void> {
	log(`workspace: ${WORKSPACE_ROOT}`);
	log(`harness:   ${HARNESS_DIR}`);
	log(`kernel:    ${KERNEL_SRC}`);
	log(`output:    ${DIST_DIR}`);

	if (!existsSync(KERNEL_SRC)) {
		throw new Error(
			`kernel source not found at ${KERNEL_SRC} — is the workspace intact?`
		);
	}

	log('cleaning dist/');
	if (existsSync(DIST_DIR)) {
		await rm(DIST_DIR, { recursive: true, force: true });
	}
	await mkdir(DIST_DIR, { recursive: true });

	log('copying harness src/');
	await copyTree(join(HARNESS_DIR, 'src'), DIST_SRC);

	log('copying kernel src/ → dist/src/_kernel/');
	await copyTree(KERNEL_SRC, DIST_KERNEL);

	log('rewriting kernel imports in harness src/');
	let rewriteCount = 0;
	for await (const file of walkTsFiles(DIST_SRC, [DIST_KERNEL])) {
		if (await rewriteImportsInFile(file)) rewriteCount += 1;
	}
	log(`  rewrote ${rewriteCount} file(s)`);

	log('copying static asset dirs');
	for (const subdir of STATIC_SUBDIRS) {
		await copyTree(
			join(HARNESS_DIR, subdir),
			join(DIST_DIR, subdir)
		);
	}

	log('copying README.md and LICENSE from workspace root');
	for (const filename of ROOT_FILES) {
		const copied = await copyOptional(
			join(WORKSPACE_ROOT, filename),
			join(DIST_DIR, filename)
		);
		if (!copied) {
			log(`  skipped ${filename} (not found at workspace root)`);
		}
	}

	log('writing dist/package.json');
	await writeDistPackageJson();

	log('done.');
}

await buildPublishable();
