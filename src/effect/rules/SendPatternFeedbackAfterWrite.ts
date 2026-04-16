import { Effect, Schema } from 'effect';

import { Decision } from '../../Decision.ts';
import { PatternCatalog } from '../../kernel/services/PatternCatalog.ts';
import { PatternMatcher } from '../../kernel/services/PatternMatcher.ts';
import { WriteProjection } from '../../kernel/services/WriteProjection.ts';
import { UserMessage } from '../../UserMessage.ts';
import { WriteIntent } from '../../WriteIntent.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const evaluate = Effect.fn('SendPatternFeedbackAfterWrite.evaluate')(
	function*({
		cwd,
		guidanceCatalog,
		patternCatalog,
		patternMatcher,
		toolName,
		writeIntent,
		writeProjection
	}: {
		readonly cwd: string;
		readonly guidanceCatalog: GuidanceCatalog.Interface;
		readonly patternCatalog: PatternCatalog.Interface;
		readonly patternMatcher: PatternMatcher.Interface;
		readonly toolName: 'write' | 'edit';
		readonly writeIntent: WriteIntentValue;
		readonly writeProjection: WriteProjection.Interface;
	}): Effect.fn.Return<ReadonlyArray<DecisionValue>> {
		const projection = yield* writeProjection.actual(cwd, writeIntent);
		const patterns = yield* patternCatalog.getPatterns;
		const matchResults = yield* Effect.forEach(
			patterns,
			(pattern) =>
				patternMatcher.matches(toolName, projection, 'after', pattern)
					.pipe(
						Effect.map((isMatch) => ({ isMatch, pattern }))
					)
		);
		const matchedPatterns = matchResults.flatMap((result) =>
			result.isMatch ? [result.pattern] : []
		);
		if (matchedPatterns.length === 0) {
			return [];
		}

		const selectedPatterns = yield* guidanceCatalog.selectPatternFeedback(
			matchedPatterns
		);
		const message = yield* guidanceCatalog.patternFeedbackMessage(
			selectedPatterns,
			projection.filePath
		);
		return [
			new Decision.InjectUserMessage({
				message: new UserMessage.Value({ content: message })
			})
		];
	}
);
