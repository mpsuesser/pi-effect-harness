import { Layer } from 'effect';

import { PatternCatalog } from '../services/PatternCatalog.ts';
import { PatternMatcher } from '../services/PatternMatcher.ts';
import { RuleCatalog } from '../services/RuleCatalog.ts';
import { WriteProjection } from '../services/WriteProjection.ts';

export namespace KernelLayer {
	const baseLayer = Layer.mergeAll(
		PatternCatalog.layer,
		PatternMatcher.layer,
		WriteProjection.layer
	);

	export const layer = Layer.mergeAll(
		baseLayer,
		RuleCatalog.layer.pipe(Layer.provide(baseLayer))
	);
}
