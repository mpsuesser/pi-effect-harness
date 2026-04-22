import { Effect } from 'effect';

import { Decision } from 'pi-harness-kit/Decision.ts';
import type { HarnessRule } from 'pi-harness-kit/kernel/HarnessRule.ts';
import { PatternCatalog } from 'pi-harness-kit/kernel/services/PatternCatalog.ts';
import { PatternMatcher } from 'pi-harness-kit/kernel/services/PatternMatcher.ts';
import { WriteProjection } from 'pi-harness-kit/kernel/services/WriteProjection.ts';
import { UserMessage } from 'pi-harness-kit/UserMessage.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';

export const sendPatternFeedbackAfterWriteRule = (deps: {
	readonly guidanceCatalog: GuidanceCatalog.Interface;
	readonly patternCatalog: PatternCatalog.Interface;
	readonly patternMatcher: PatternMatcher.Interface;
	readonly writeProjection: WriteProjection.Interface;
}): HarnessRule.ToolResult => ({
	id: 'effect.send-pattern-feedback-after-write',
	phase: 'toolResult',
	evaluate: Effect.fn('SendPatternFeedbackAfterWrite.evaluate')(
		function*(input) {
			const projection = yield* deps.writeProjection.actual(
				input.cwd,
				input.writeIntent
			);
			const patterns = yield* deps.patternCatalog.getPatterns;
			const matchResults = yield* Effect.forEach(
				patterns,
				(pattern) =>
					deps.patternMatcher.matches(
						input.toolName,
						projection,
						'after',
						pattern
					).pipe(
						Effect.map((isMatch) => ({ isMatch, pattern }))
					)
			);
			const matchedPatterns = matchResults.flatMap((result) =>
				result.isMatch ? [result.pattern] : []
			);
			if (matchedPatterns.length === 0) {
				return [];
			}

			const selectedPatterns = yield* deps.guidanceCatalog
				.selectPatternFeedback(
					matchedPatterns
				);
			const message = yield* deps.guidanceCatalog.patternFeedbackMessage(
				selectedPatterns,
				projection.filePath
			);
			return [
				new Decision.InjectUserMessage({
					message: new UserMessage.Value({ content: message })
				})
			];
		}
	)
});
