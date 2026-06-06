/**
 * Regression tests for the subagent-child bypass of the Effect skill gate.
 *
 * A forked worker runs a narrow task with a limited turn budget and, in
 * replace-mode prompts, no available_skills catalog. Hard-blocking its writes
 * until it reads N effect-* skills deadlocks it in a loop hunting for skill
 * files it cannot see. In subagent child sessions the gate must be advisory:
 * it never blocks. In ordinary sessions it must still block Effect writes that
 * have not loaded enough skills.
 */

import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';

import { ActiveBranch } from 'pi-harness-kit/ActiveBranch.ts';
import { Decision } from 'pi-harness-kit/Decision.ts';
import { MatcherInput } from 'pi-harness-kit/kernel/MatcherInput.ts';
import type { WriteProjection } from 'pi-harness-kit/kernel/services/WriteProjection.ts';
import { WriteIntent } from 'pi-harness-kit/WriteIntent.ts';
import { requireLoadedSkillsForEffectWritesRule } from '../src/rules/RequireLoadedSkillsForEffectWrites.ts';
import type { GuidanceCatalog } from '../src/services/GuidanceCatalog.ts';
import type { PendingSkillReads } from '../src/services/PendingSkillReads.ts';

const effectContent = "import { Effect } from 'effect';\n"
	+ 'export const program = Effect.succeed(1);\n';

const guidanceCatalogStub: GuidanceCatalog.Interface = {
	policyHeader: () => Effect.succeed(''),
	skillGateReason: (loadedCount) =>
		Effect.succeed(`blocked:${String(loadedCount)}`),
	selectPatternFeedback: () => Effect.succeed([]),
	patternFeedbackMessage: () => Effect.succeed('')
};

const pendingSkillReadsStub: PendingSkillReads.Interface = {
	clear: Effect.void,
	remember: () => Effect.void,
	take: () => Effect.sync(() => undefined),
	names: Effect.succeed([])
};

// Projects every write as Effect code with zero changed spans, so the gate
// always sees "Effect code, 0 skills loaded".
const writeProjectionStub: WriteProjection.Interface = {
	raw: () => Effect.succeed(emptyMatcherInput()),
	prospective: () =>
		Effect.succeed(
			new MatcherInput.Value({
				filePath: Option.some('src/program.ts'),
				content: Option.some(effectContent),
				changedSpans: Option.none(),
				command: Option.none(),
				pattern: Option.none(),
				query: Option.none(),
				url: Option.none(),
				prompt: Option.none()
			})
		),
	actual: () => Effect.succeed(emptyMatcherInput())
};

function emptyMatcherInput(): MatcherInput.Value {
	return new MatcherInput.Value({
		filePath: Option.none(),
		content: Option.none(),
		changedSpans: Option.none(),
		command: Option.none(),
		pattern: Option.none(),
		query: Option.none(),
		url: Option.none(),
		prompt: Option.none()
	});
}

const evaluateGate = (isSubagentChild: boolean) =>
	requireLoadedSkillsForEffectWritesRule({
		guidanceCatalog: guidanceCatalogStub,
		pendingSkillReads: pendingSkillReadsStub,
		writeProjection: writeProjectionStub,
		isSubagentChild
	}).evaluate({
		activeBranch: new ActiveBranch.Value({ entries: [] }),
		cwd: '/tmp/project',
		writeIntent: new WriteIntent.WriteFile({
			phase: 'tool_call',
			filePath: 'src/program.ts',
			content: effectContent
		})
	});

describe('skill gate subagent-child bypass', () => {
	it.effect('does not block Effect writes in subagent child sessions', () =>
		Effect.gen(function*() {
			const decisions = yield* evaluateGate(true);
			expect(decisions).toEqual([]);
		}));

	it.effect('still blocks Effect writes in ordinary sessions', () =>
		Effect.gen(function*() {
			const decisions = yield* evaluateGate(false);
			expect(decisions.length).toBe(1);
			expect(decisions[0]).toBeInstanceOf(Decision.BlockToolCall);
		}));
});
