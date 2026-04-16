import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, FileSystem, Layer, Path, Schema } from 'effect';

import { PatternCatalog } from '../../src/kernel/services/PatternCatalog.ts';
import { WriteProjection } from '../../src/kernel/services/WriteProjection.ts';
import { WriteIntent } from '../../src/WriteIntent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const nodePlatformLayer = Layer.mergeAll(
	NodeFileSystem.layer,
	NodePath.layer
);

export const patternCatalogLayer = PatternCatalog.layer.pipe(
	Layer.provide(nodePlatformLayer)
);

export const writeProjectionLayer = WriteProjection.layer.pipe(
	Layer.provide(nodePlatformLayer)
);

export const loadPatternsEffect = PatternCatalog.Service.use(
	(catalog) => catalog.getPatterns
).pipe(Effect.provide(patternCatalogLayer));

export const loadPatternRulesEffect = PatternCatalog.Service.use(
	(catalog) => catalog.getRules
).pipe(Effect.provide(patternCatalogLayer));

export const projectProspectiveEffect = (
	cwd: string,
	intent: WriteIntentValue
) => WriteProjection.Service.use((projection) =>
	projection.prospective(cwd, intent)
).pipe(Effect.provide(writeProjectionLayer));

export const projectActualEffect = (cwd: string, intent: WriteIntentValue) =>
	WriteProjection.Service.use((projection) => projection.actual(cwd, intent))
		.pipe(
			Effect.provide(writeProjectionLayer)
		);

export const withTempFile = <A, E>(
	prefix: string,
	filePath: string,
	content: string,
	run: (fixture: {
		readonly cwd: string;
		readonly filePath: string;
		readonly absolutePath: string;
	}) => Effect.Effect<A, E>
) => Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const cwd = yield* fs.makeTempDirectoryScoped({ prefix });
	const absolutePath = path.join(cwd, filePath);
	yield* fs.makeDirectory(path.dirname(absolutePath), { recursive: true });
	yield* fs.writeFileString(absolutePath, content);
	return yield* run({ cwd, filePath, absolutePath });
}).pipe(Effect.provide(nodePlatformLayer));
