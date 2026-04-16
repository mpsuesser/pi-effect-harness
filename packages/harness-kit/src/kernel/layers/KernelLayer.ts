import { Layer } from 'effect';

import { PatternCatalog } from '../services/PatternCatalog.ts';
import { PatternMatcher } from '../services/PatternMatcher.ts';
import { RuleCatalog } from '../services/RuleCatalog.ts';
import { WriteProjection } from '../services/WriteProjection.ts';

export namespace KernelLayer {
	export const layer = (patternsDir: string) => {
		const baseLayer = Layer.mergeAll(
			PatternCatalog.layer(patternsDir),
			PatternMatcher.layer,
			WriteProjection.layer
		);
		return Layer.mergeAll(
			baseLayer,
			RuleCatalog.layer.pipe(Layer.provide(baseLayer))
		);
	};
}
