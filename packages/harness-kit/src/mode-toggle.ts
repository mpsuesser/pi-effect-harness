import type {
	BeforeAgentStartEvent,
	ExtensionAPI,
	ExtensionContext
} from '@mariozechner/pi-coding-agent';

import { MODE_REGISTER_EVENT, MODE_UNREGISTER_EVENT } from './constants.ts';

export interface ModeRegistration {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	readonly description?: string;
	readonly persistenceScope: 'none';
	readonly isEnabled: () => boolean;
	readonly setEnabled: (enabled: boolean, ctx: ExtensionContext) => void;
}

export interface CreateModeToggleOptions {
	readonly id: string;
	readonly name?: string;
	readonly color: string;
	readonly statusText: string;
	readonly description?: string;
	readonly enabledLabel?: string;
	readonly disabledLabel?: string;
	/**
	 * If provided, register a Pi slash command whose handler toggles this mode.
	 * Use this when the harness should be self-sufficient and not rely on an
	 * external mode-toggler extension to expose the toggle UI.
	 */
	readonly slashCommand?: {
		readonly name: string;
		readonly description?: string;
	};
	readonly onChange?: (enabled: boolean, ctx: ExtensionContext) => void;
}

export interface ModeToggle {
	readonly id: string;
	readonly name: string;
	isEnabled(): boolean;
	setEnabled(enabled: boolean, ctx: ExtensionContext): void;
	toggle(ctx: ExtensionContext): void;
	syncStatus(ctx: ExtensionContext): void;
	onSessionStart(ctx: ExtensionContext, initialEnabled?: boolean): void;
	onSessionShutdown(ctx: ExtensionContext): void;
	beforeAgentStart(
		event: Pick<BeforeAgentStartEvent, 'systemPrompt'>,
		systemPrompt?: string
	):
		| {
			message?: {
				customType: string;
				content: string;
				display: true;
			};
			systemPrompt?: string;
		}
		| undefined;
}

const PERSISTENCE_SCOPE = 'none' as const;

export const createModeToggle = (
	pi: ExtensionAPI,
	options: CreateModeToggleOptions
): ModeToggle => {
	const name = options.name ?? options.id;
	const enabledLabel = options.enabledLabel ?? `${name} mode enabled`;
	const disabledLabel = options.disabledLabel ?? `${name} mode disabled`;

	let enabled = false;
	let lastPromptEnabled: boolean | undefined;

	const statusMessage = (): string => enabled ? enabledLabel : disabledLabel;

	const emitRegistration = (): void => {
		const registration: ModeRegistration = {
			id: options.id,
			name,
			color: options.color,
			persistenceScope: PERSISTENCE_SCOPE,
			...(options.description !== undefined
				? { description: options.description }
				: undefined),
			isEnabled: () => enabled,
			setEnabled: (nextEnabled, ctx) => {
				mode.setEnabled(nextEnabled, ctx);
			}
		};
		pi.events.emit(MODE_REGISTER_EVENT, registration);
	};

	const syncStatus = (ctx: ExtensionContext): void => {
		ctx.ui.setStatus(options.id, enabled ? options.statusText : undefined);
	};

	const mode: ModeToggle = {
		id: options.id,
		name,
		isEnabled: () => enabled,
		setEnabled: (nextEnabled, ctx) => {
			if (enabled === nextEnabled) {
				return;
			}

			enabled = nextEnabled;
			syncStatus(ctx);
			ctx.ui.notify(statusMessage(), 'info');
			options.onChange?.(enabled, ctx);
		},
		toggle: (ctx) => {
			mode.setEnabled(!enabled, ctx);
		},
		syncStatus: (ctx) => {
			syncStatus(ctx);
		},
		onSessionStart: (ctx, initialEnabled) => {
			enabled = initialEnabled ?? false;
			emitRegistration();
			syncStatus(ctx);
			lastPromptEnabled = ctx.sessionManager.getBranch().some(
					(entry) =>
						entry.type === 'message' &&
						entry.message.role === 'user'
				)
				? enabled
				: undefined;
		},
		onSessionShutdown: (ctx) => {
			pi.events.emit(MODE_UNREGISTER_EVENT, options.id);
			ctx.ui.setStatus(options.id, undefined);
		},
		beforeAgentStart: (event, systemPrompt) => {
			const statusChanged = lastPromptEnabled !== undefined &&
				lastPromptEnabled !== enabled;
			lastPromptEnabled = enabled;

			if (!enabled && !statusChanged) {
				return undefined;
			}

			return {
				...(statusChanged
					? {
						message: {
							customType: options.id,
							content: statusMessage(),
							display: true as const
						}
					}
					: undefined),
				...(enabled && systemPrompt
					? {
						systemPrompt: `${event.systemPrompt}\n\n${systemPrompt}`
					}
					: undefined)
			};
		}
	};

	emitRegistration();

	if (options.slashCommand !== undefined) {
		const commandDescription = options.slashCommand.description
			?? `Toggle ${name} mode`;
		pi.registerCommand(options.slashCommand.name, {
			description: commandDescription,
			handler: (_args, ctx) => {
				mode.toggle(ctx);
				return Promise.resolve();
			}
		});
	}

	return mode;
};
