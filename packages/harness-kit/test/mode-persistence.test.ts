import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path } from 'effect';

import { GitBranch } from '../src/mode/GitBranch.ts';
import { ModePersistence } from '../src/mode/ModePersistence.ts';

const fileSystemLayer = Layer.effect(
	FileSystem.FileSystem,
	Effect.sync(() => {
		const files = new Map<string, string>();
		return FileSystem.makeNoop({
			exists: (filePath: string) => Effect.succeed(files.has(filePath)),
			makeDirectory: () => Effect.void,
			readFileString: (filePath: string) =>
				Effect.succeed(files.get(filePath) ?? ''),
			writeFileString: (filePath: string, content: string) =>
				Effect.sync(() => {
					files.set(filePath, content);
				})
		});
	})
);

const gitBranchLayer = Layer.succeed(
	GitBranch.Service,
	GitBranch.Service.of({
		get: () => Effect.void.pipe(Effect.as(undefined))
	})
);

const supportingLayer = Layer.mergeAll(
	fileSystemLayer,
	Path.layer,
	gitBranchLayer
);

const testLayer = Layer.mergeAll(
	supportingLayer,
	ModePersistence.layer.pipe(Layer.provide(supportingLayer))
);

const location = ({
	cwd,
	sessionDir,
	sessionId,
	scope
}: {
	readonly cwd: string;
	readonly sessionDir: string;
	readonly sessionId: string;
	readonly scope: ModePersistence.Scope;
}): ModePersistence.Location => ({
	cwd,
	modeId: 'effect',
	scope,
	sessionDir,
	sessionId
});

const dirs = {
	cwd: '/repo',
	sessionDir: '/session',
	sessionId: 'session-1'
};

describe('ModePersistence', () => {
	it.effect('returns undefined when no persisted mode state exists', () =>
		Effect.gen(function*() {
			const persistence = yield* ModePersistence.Service;
			const persisted = yield* persistence.load(
				location({ ...dirs, scope: 'project' })
			);

			expect(persisted).toBeUndefined();
		}).pipe(Effect.provide(testLayer)));

	it.effect('round-trips persisted project mode state', () =>
		Effect.gen(function*() {
			const persistence = yield* ModePersistence.Service;
			const modeLocation = location({ ...dirs, scope: 'project' });
			yield* persistence.save(modeLocation, true);
			const persisted = yield* persistence.load(modeLocation);

			expect(persisted).toBe(true);
		}).pipe(Effect.provide(testLayer)));

	it.effect('falls back to project persistence when branch scope has no git branch', () =>
		Effect.gen(function*() {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const persistence = yield* ModePersistence.Service;
			yield* persistence.save(
				location({ ...dirs, scope: 'branch' }),
				true
			);

			const expectedPath = path.join(
				dirs.sessionDir,
				'.pi-mode-toggler',
				'project',
				'effect.json'
			);
			expect(yield* fs.exists(expectedPath)).toBe(true);
		}).pipe(Effect.provide(testLayer)));
});
