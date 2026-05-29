/**
 * pi-effect-harness
 *
 * a harness specifically for writing Effect v4 code
 *
 * @since 0.1.0
 */
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir
} from '@mariozechner/pi-coding-agent';
import { Effect, ManagedRuntime, Option, Schema } from 'effect';

import { Decision } from 'pi-harness-kit/Decision.ts';
import { activeBranchFromContext } from 'pi-harness-kit/kernel/adapters/BeforeAgentStartSnapshot.ts';
import {
	executeSideEffects,
	toToolCallResult
} from 'pi-harness-kit/kernel/adapters/DecisionExecutor.ts';
import {
	writeIntentFromToolCall,
	writeIntentFromToolResult
} from 'pi-harness-kit/kernel/adapters/ToolEventSnapshot.ts';
import { HarnessController } from 'pi-harness-kit/kernel/services/HarnessController.ts';
import { createModeToggle } from 'pi-harness-kit/mode-toggle.ts';
import { ModePersistence } from 'pi-harness-kit/mode/ModePersistence.ts';
import { ModeState } from 'pi-harness-kit/mode/ModeState.ts';

import {
	EFFECT_STATUS,
	SKILL_LOADED_ENTRY,
	SKILL_READ_ENTRY
} from './constants.ts';
import { EffectHarnessLayer } from './layers/EffectHarnessLayer.ts';
import { ReferenceClone } from './services/ReferenceClone.ts';
import { SkillCatalog } from './services/SkillCatalog.ts';
import {
	formatSkillReadSummary,
	type SkillReadSummary,
	SkillReadTelemetry
} from './services/SkillReadTelemetry.ts';

const EFFECT_MODE_ID = 'effect';
const EFFECT_MODE_KEY = 'e';
const EFFECT_MODE_COLOR = '#d4af37';
const EFFECT_MODE_DESCRIPTION =
	'Enable Effect v4 guidance, skill gating, and pattern checks';
const EFFECT_MODE_PERSISTENCE_SCOPE: ModePersistence.Scope = 'project';
const EFFECT_MODE_SLASH_COMMAND = 'toggle-effect-harness';
const EFFECT_MODE_SLASH_COMMAND_DESCRIPTION =
	'Toggle the pi-effect-harness Effect v4 mode (skill gating, policy header, pattern feedback)';
const SKILL_STATS_SLASH_COMMAND = 'effect-skill-stats';
const SKILL_STATS_SLASH_COMMAND_DESCRIPTION =
	'Show pi-effect-harness Effect skill read metrics';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;

type ModePersistenceContext = {
	readonly cwd: string;
	readonly sessionDir: string;
	readonly sessionId: string;
};

const systemPromptFromDecisions = (
	decisions: ReadonlyArray<DecisionValue>
): string | undefined => {
	const additions = decisions
		.filter(
			(decision): decision is Decision.InjectSystemPrompt =>
				decision instanceof Decision.InjectSystemPrompt
		)
		.map((decision) => decision.content);
	return additions.length === 0 ? undefined : additions.join('\n\n');
};

const modePersistenceLocation = (
	ctx: ModePersistenceContext
): ModePersistence.Location => ({
	cwd: ctx.cwd,
	modeId: EFFECT_MODE_ID,
	scope: EFFECT_MODE_PERSISTENCE_SCOPE,
	sessionDir: ctx.sessionDir,
	sessionId: ctx.sessionId
});

const durationUnitMillis = (unit: string): number | undefined => {
	switch (unit) {
		case 'ms':
			return 1;
		case 's':
			return 1_000;
		case 'm':
			return 60_000;
		case 'h':
			return 60 * 60_000;
		case 'd':
			return 24 * 60 * 60_000;
		case 'w':
			return 7 * 24 * 60 * 60_000;
		default:
			return undefined;
	}
};

const parseDurationMillis = (value: string): number | undefined => {
	const match = /^(\d+)(ms|s|m|h|d|w)$/.exec(value.trim());
	if (match === null) {
		return undefined;
	}
	const amount = Number(match[1]);
	const unit = durationUnitMillis(match[2] ?? '');
	return unit === undefined ? undefined : amount * unit;
};

const parseSkillStatsArgs = (
	args: string
): { readonly json: boolean; readonly sinceDurationMillis?: number; } => {
	const parts = args.trim().length === 0
		? []
		: args.trim().split(/\s+/g);
	let json = false;
	let sinceDurationMillis: number | undefined;

	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];
		if (part === '--json') {
			json = true;
			continue;
		}
		if (part === '--since') {
			const value = parts[index + 1];
			if (value !== undefined) {
				sinceDurationMillis = parseDurationMillis(value);
				index++;
			}
			continue;
		}
		if (part?.startsWith('--since=')) {
			sinceDurationMillis = parseDurationMillis(
				part.slice('--since='.length)
			);
		}
	}

	return sinceDurationMillis === undefined
		? { json }
		: { json, sinceDurationMillis };
};

const effectSkillCommandName = (text: string): string | undefined => {
	const match = /^\/skill:(effect-[a-z0-9-]+)(?:\s|$)/.exec(text.trim());
	return match?.[1];
};

const skillSummaryContent = ({
	json,
	summary
}: {
	readonly json: boolean;
	readonly summary: SkillReadSummary;
}): string =>
	json
		? Schema.encodeSync(Schema.UnknownFromJsonString)(summary)
		: formatSkillReadSummary(summary);

const notifyWarning = (
	ctx: Pick<ExtensionContext, 'ui'>,
	message: string
): void => {
	ctx.ui.notify(message, 'warning');
};

export default function effectEnforcer(pi: ExtensionAPI): void {
	const runtime = ManagedRuntime.make(
		EffectHarnessLayer.layer({ agentDir: getAgentDir() })
	);
	type RuntimeServices = ManagedRuntime.ManagedRuntime.Services<
		typeof runtime
	>;

	const run = <A, E, R extends RuntimeServices>(
		effect: Effect.Effect<A, E, R>
	) => runtime.runPromise(effect);

	const runWithController = <A>(
		f: (controller: HarnessController.Interface) => Effect.Effect<A>
	) => run(
		Effect.gen(function*() {
			const controller = yield* HarnessController.Service;
			return yield* f(controller);
		})
	);

	const syncModeState = (enabled: boolean) =>
		run(
			Effect.gen(function*() {
				const modeState = yield* ModeState.Service;
				yield* modeState.setEnabled(enabled);
			})
		);

	const loadPersistedModeState = (ctx: ModePersistenceContext) =>
		run(
			Effect.gen(function*() {
				const modePersistence = yield* ModePersistence.Service;
				return yield* modePersistence.load(
					modePersistenceLocation(ctx)
				);
			})
		);

	const savePersistedModeState = (
		ctx: ModePersistenceContext,
		enabled: boolean
	) => run(
		Effect.gen(function*() {
			const modePersistence = yield* ModePersistence.Service;
			yield* modePersistence.save(modePersistenceLocation(ctx), enabled);
		})
	);

	const ensureReferenceIfEnabled = (enabled: boolean) =>
		run(
			Effect.gen(function*() {
				const modeState = yield* ModeState.Service;
				yield* modeState.setEnabled(enabled);
				if (!enabled) {
					return;
				}

				const referenceClone = yield* ReferenceClone.Service;
				yield* referenceClone.ensure();
			})
		);

	const recordSkillCommandRead = (
		skillName: string,
		ctx: ExtensionContext
	) => run(
		Effect.gen(function*() {
			const skillCatalog = yield* SkillCatalog.Service;
			const skillReadTelemetry = yield* SkillReadTelemetry.Service;
			const entries = yield* skillCatalog.entries;
			const skill = entries.find((entry) => entry.name === skillName);
			if (skill === undefined) {
				return Option.none<{
					readonly name: string;
					readonly path: string;
					readonly record: unknown;
				}>();
			}
			const sessionFile = ctx.sessionManager.getSessionFile();
			const record = yield* skillReadTelemetry.recordRead({
				source: 'skill-command',
				skill,
				readPath: skill.skillFilePath,
				cwd: ctx.cwd,
				sessionId: ctx.sessionManager.getSessionId(),
				...(sessionFile === undefined ? undefined : { sessionFile })
			});
			return Option.some({
				name: skill.name,
				path: skill.skillFilePath,
				record
			});
		})
	);

	const summarizeSkillReads = (
		options: { readonly sinceDurationMillis?: number; }
	) => run(
		Effect.gen(function*() {
			const skillCatalog = yield* SkillCatalog.Service;
			const skillReadTelemetry = yield* SkillReadTelemetry.Service;
			const entries = yield* skillCatalog.entries;
			return yield* skillReadTelemetry.summarize({
				knownSkillNames: entries.map((entry) => entry.name),
				...(options.sinceDurationMillis === undefined
					? undefined
					: { sinceDurationMillis: options.sinceDurationMillis })
			});
		})
	);

	const mode = createModeToggle(pi, {
		id: EFFECT_MODE_ID,
		key: EFFECT_MODE_KEY,
		color: EFFECT_MODE_COLOR,
		statusText: EFFECT_STATUS,
		description: EFFECT_MODE_DESCRIPTION,
		slashCommand: {
			name: EFFECT_MODE_SLASH_COMMAND,
			description: EFFECT_MODE_SLASH_COMMAND_DESCRIPTION
		},
		onChange: (enabled, ctx) => {
			void syncModeState(enabled);
			void savePersistedModeState(
				{
					cwd: ctx.cwd,
					sessionDir: ctx.sessionManager.getSessionDir(),
					sessionId: ctx.sessionManager.getSessionId()
				},
				enabled
			).catch(() => {
				ctx.ui.notify('Failed to persist effect mode state', 'warning');
			});
			void ensureReferenceIfEnabled(enabled);
		}
	});

	pi.registerCommand(SKILL_STATS_SLASH_COMMAND, {
		description: SKILL_STATS_SLASH_COMMAND_DESCRIPTION,
		handler: async (args, ctx) => {
			const options = parseSkillStatsArgs(args);
			const summary = await summarizeSkillReads(options).catch(() => {
				notifyWarning(ctx, 'Failed to read Effect skill metrics');
				return undefined;
			});
			if (summary === undefined) {
				return;
			}
			pi.sendMessage({
				customType: 'pi-effect-harness:skill-stats',
				content: skillSummaryContent({ json: options.json, summary }),
				display: true,
				details: summary
			});
		}
	});

	pi.on('session_start', async (_event, ctx) => {
		const restoredEnabled = await loadPersistedModeState({
			cwd: ctx.cwd,
			sessionDir: ctx.sessionManager.getSessionDir(),
			sessionId: ctx.sessionManager.getSessionId()
		}).catch(() => {
			ctx.ui.notify('Failed to restore effect mode state', 'warning');
			return undefined;
		});
		mode.onSessionStart(ctx, restoredEnabled);
		await syncModeState(mode.isEnabled());
		await runWithController((controller) =>
			controller.onSessionStart({
				commands: pi.getCommands(),
				cwd: ctx.cwd
			})
		);
	});

	pi.on('session_tree', async (_event, ctx) => {
		mode.syncStatus(ctx);
		await syncModeState(mode.isEnabled());
		await runWithController((controller) =>
			controller.onSessionTree({
				commands: pi.getCommands(),
				cwd: ctx.cwd
			})
		);
	});

	pi.on('session_shutdown', async (_event, ctx) => {
		mode.onSessionShutdown(ctx);
	});

	pi.on('input', async (event, ctx) => {
		const skillName = effectSkillCommandName(event.text);
		if (skillName === undefined) {
			return { action: 'continue' as const };
		}
		const recorded = await recordSkillCommandRead(skillName, ctx).catch(
			() => {
				notifyWarning(
					ctx,
					'Failed to record Effect skill command metrics'
				);
				return Option.none<{
					readonly name: string;
					readonly path: string;
					readonly record: unknown;
				}>();
			}
		);
		if (Option.isSome(recorded)) {
			pi.appendEntry(SKILL_READ_ENTRY, recorded.value.record);
			pi.appendEntry(SKILL_LOADED_ENTRY, {
				name: recorded.value.name,
				path: recorded.value.path
			});
		}
		return { action: 'continue' as const };
	});

	pi.on('before_agent_start', async (event, ctx) => {
		const decisions = await runWithController((controller) =>
			controller.onBeforeAgentStart({
				activeBranch: activeBranchFromContext(ctx),
				cwd: ctx.cwd
			})
		);
		return mode.beforeAgentStart(
			event,
			systemPromptFromDecisions(decisions)
		);
	});

	pi.on('tool_call', async (event, ctx) => {
		const decisions = await runWithController((controller) =>
			controller.onToolCall({
				activeBranch: activeBranchFromContext(ctx),
				cwd: ctx.cwd,
				input: event.input,
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				writeIntent: writeIntentFromToolCall(event)
			})
		);
		return toToolCallResult(decisions);
	});

	pi.on('tool_result', async (event, ctx) => {
		const decisions = await runWithController((controller) =>
			controller.onToolResult({
				activeBranch: activeBranchFromContext(ctx),
				cwd: ctx.cwd,
				input: event.input,
				isError: event.isError,
				sessionFile: ctx.sessionManager.getSessionFile(),
				sessionId: ctx.sessionManager.getSessionId(),
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				writeIntent: writeIntentFromToolResult(event)
			})
		);
		executeSideEffects(pi, ctx, decisions);
	});
}
