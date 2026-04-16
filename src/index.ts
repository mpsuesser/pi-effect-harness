/**
 * pi-effect-enforcer
 *
 * a harness specifically for writing Effect v4 code
 *
 * @since 0.1.0
 */
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import {
	EFFECT_CODE_RE,
	EFFECT_STATUS,
	MIN_EFFECT_SKILLS,
	SKILL_LOADED_ENTRY,
	WRITE_TOOLS
} from './constants.ts';
import { detectEffectVersion } from './functions/detectEffectVersion.ts';
import { ensureReferenceClone } from './functions/ensureReferenceClone.ts';
import { projectToolOutputInput } from './inspectors.ts';
import { createModeToggle } from './mode-toggle.ts';
import { getPatterns, matches, type PatternDefinition } from './patterns.ts';
import {
	buildPatternFeedbackMessage,
	buildPolicyHeader,
	buildSkillGateReason,
	selectPatternFeedback
} from './policy.ts';
import {
	buildEffectSkillIndex,
	getLoadedEffectSkillsFromSession,
	matchEffectSkillForPath,
	normalizePath,
	type SkillIndexEntry,
	type SkillLoadedEntryData
} from './skills.ts';

const EFFECT_MODE_ID = 'effect';
const EFFECT_MODE_COLOR = '#d4af37';
const EFFECT_MODE_DESCRIPTION =
	'Enable Effect v4 guidance, skill gating, and pattern checks';

export default function effectEnforcer(pi: ExtensionAPI): void {
	let cwd = process.cwd();
	let effectVersion = detectEffectVersion(cwd);
	let skillIndex: ReadonlyArray<SkillIndexEntry> = [];
	let loadedSkills = new Set<string>();
	const pendingSkillReads = new Map<string, string>();

	const rebuildSkillIndex = (): void => {
		skillIndex = buildEffectSkillIndex(pi, cwd);
	};

	const ensureReference = async (): Promise<void> => {
		await ensureReferenceClone(cwd, effectVersion);
	};

	const mode = createModeToggle(pi, {
		id: EFFECT_MODE_ID,
		color: EFFECT_MODE_COLOR,
		statusText: EFFECT_STATUS,
		description: EFFECT_MODE_DESCRIPTION,
		persistence: {
			scope: 'project'
		},
		onChange: (enabled) => {
			if (enabled) {
				void ensureReference();
			}
		}
	});

	const restoreSessionState = (
		ctx: Parameters<typeof mode.onSessionStart>[0]
	): void => {
		pendingSkillReads.clear();
		loadedSkills = getLoadedEffectSkillsFromSession(ctx);
		rebuildSkillIndex();
		mode.syncStatus(ctx);
	};

	const runPatterns = (
		eventType: 'before' | 'after',
		toolName: string,
		projectedInput: Record<string, unknown>
	): PatternDefinition[] => {
		return getPatterns().filter((pattern) =>
			matches(toolName, projectedInput, eventType, pattern)
		);
	};

	const getLoadedSkillCountWithPendingReads = (): number => {
		const combined = new Set(loadedSkills);
		for (const name of pendingSkillReads.values()) {
			combined.add(name);
		}
		return combined.size;
	};

	pi.on('session_start', async (_event, ctx) => {
		cwd = ctx.cwd;
		effectVersion = detectEffectVersion(cwd);
		mode.onSessionStart(ctx);
		restoreSessionState(ctx);
		if (mode.isEnabled()) {
			await ensureReference();
		}
	});

	pi.on('session_tree', async (_event, ctx) => {
		restoreSessionState(ctx);
	});

	pi.on('session_shutdown', async (_event, ctx) => {
		mode.onSessionShutdown(ctx);
	});

	pi.on('before_agent_start', async (event) => {
		if (mode.isEnabled() && skillIndex.length === 0) rebuildSkillIndex();
		if (mode.isEnabled()) {
			void ensureReference();
		}

		return mode.beforeAgentStart(
			event,
			mode.isEnabled() ? buildPolicyHeader(loadedSkills) : undefined
		);
	});

	pi.on('tool_call', async (event, ctx) => {
		if (skillIndex.length === 0) rebuildSkillIndex();

		if (event.toolName === 'read') {
			const readInput = event.input as { path?: unknown };
			if (typeof readInput.path === 'string') {
				const absPath = normalizePath(readInput.path, ctx.cwd);
				const matchedSkill = matchEffectSkillForPath(
					absPath,
					skillIndex
				);
				if (matchedSkill) {
					pendingSkillReads.set(event.toolCallId, matchedSkill.name);
				}
			}
		}

		if (!mode.isEnabled()) return undefined;

		const projectedOutputInput = projectToolOutputInput(event.input) as Record<
			string,
			unknown
		>;

		if (WRITE_TOOLS.has(event.toolName)) {
			const matchableContent =
				typeof projectedOutputInput.content === 'string'
					? projectedOutputInput.content
					: '';
			if (EFFECT_CODE_RE.test(matchableContent)) {
				const loadedCount = getLoadedSkillCountWithPendingReads();
				if (loadedCount < MIN_EFFECT_SKILLS) {
					return {
						block: true,
						reason: buildSkillGateReason(loadedCount)
					};
				}
			}
		}

		return undefined;
	});

	pi.on('tool_result', async (event, ctx) => {
		if (event.toolName === 'read') {
			const pendingSkill = pendingSkillReads.get(event.toolCallId);
			pendingSkillReads.delete(event.toolCallId);
			if (!event.isError && pendingSkill) {
				const readInput = event.input as { path?: unknown };
				if (
					typeof readInput.path === 'string' &&
					!loadedSkills.has(pendingSkill)
				) {
					const absPath = normalizePath(readInput.path, ctx.cwd);
					loadedSkills.add(pendingSkill);
					pi.appendEntry<SkillLoadedEntryData>(SKILL_LOADED_ENTRY, {
						name: pendingSkill,
						path: absPath
					});
				}
			}
		}

		if (!mode.isEnabled() || event.isError) return;
		if (!WRITE_TOOLS.has(event.toolName)) return;

		const projectedInput = projectToolOutputInput(event.input) as Record<
			string,
			unknown
		>;
		const matchedPatterns = selectPatternFeedback(
			runPatterns('after', event.toolName, projectedInput)
		);
		if (matchedPatterns.length === 0) return;

		const feedbackMessage = buildPatternFeedbackMessage(
			matchedPatterns,
			typeof projectedInput.filePath === 'string'
				? projectedInput.filePath
				: undefined
		);
		if (ctx.isIdle()) {
			pi.sendUserMessage(feedbackMessage);
			return;
		}

		pi.sendUserMessage(feedbackMessage, { deliverAs: 'steer' });
	});
}
