/**
 * pi-effect-enforcer
 *
 * a harness specifically for writing Effect v4 code
 *
 * @since 0.1.0
 */
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Effect, ManagedRuntime, Schema } from 'effect';

import { EFFECT_STATUS } from './constants.ts';
import { Decision } from './Decision.ts';
import { EffectHarnessLayer } from './effect/layers/EffectHarnessLayer.ts';
import { EffectVersion } from './effect/services/EffectVersion.ts';
import { ModePersistence } from './effect/services/ModePersistence.ts';
import { ModeState } from './effect/services/ModeState.ts';
import { ReferenceClone } from './effect/services/ReferenceClone.ts';
import { activeBranchFromContext } from './kernel/adapters/BeforeAgentStartSnapshot.ts';
import {
	executeSideEffects,
	toToolCallResult
} from './kernel/adapters/DecisionExecutor.ts';
import {
	writeIntentFromToolCall,
	writeIntentFromToolResult
} from './kernel/adapters/ToolEventSnapshot.ts';
import { HarnessController } from './kernel/services/HarnessController.ts';
import { createModeToggle } from './mode-toggle.ts';

const EFFECT_MODE_ID = 'effect';
const EFFECT_MODE_COLOR = '#d4af37';
const EFFECT_MODE_DESCRIPTION =
	'Enable Effect v4 guidance, skill gating, and pattern checks';
const EFFECT_MODE_PERSISTENCE_SCOPE: ModePersistence.Scope = 'project';

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

export default function effectEnforcer(pi: ExtensionAPI): void {
	const runtime = ManagedRuntime.make(EffectHarnessLayer.layer);
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

	const ensureReferenceIfEnabled = (cwd: string, enabled: boolean) =>
		run(
			Effect.gen(function*() {
				const modeState = yield* ModeState.Service;
				yield* modeState.setEnabled(enabled);
				if (!enabled) {
					return;
				}

				const effectVersion = yield* EffectVersion.Service;
				const referenceClone = yield* ReferenceClone.Service;
				const version = yield* effectVersion.refresh(cwd);
				yield* referenceClone.ensure(cwd, version);
			})
		);

	const mode = createModeToggle(pi, {
		id: EFFECT_MODE_ID,
		color: EFFECT_MODE_COLOR,
		statusText: EFFECT_STATUS,
		description: EFFECT_MODE_DESCRIPTION,
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
			void ensureReferenceIfEnabled(ctx.cwd, enabled);
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
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				writeIntent: writeIntentFromToolResult(event)
			})
		);
		executeSideEffects(pi, ctx, decisions);
	});
}
