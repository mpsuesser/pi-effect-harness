import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
	BeforeAgentStartEvent,
	ExtensionAPI,
	ExtensionContext
} from '@mariozechner/pi-coding-agent';

import { MODE_REGISTER_EVENT, MODE_UNREGISTER_EVENT } from './constants.ts';

export type ModePersistenceScope =
	| 'none'
	| 'session'
	| 'project'
	| 'branch'
	| 'global';

export interface ModePersistenceOptions {
	scope: ModePersistenceScope;
}

export interface ModeRegistration {
	id: string;
	name: string;
	color: string;
	description?: string;
	persistenceScope: ModePersistenceScope;
	isEnabled: () => boolean;
	setEnabled: (enabled: boolean, ctx: ExtensionContext) => void;
}

export interface CreateModeToggleOptions {
	id: string;
	name?: string;
	color: string;
	statusText: string;
	description?: string;
	enabledLabel?: string;
	disabledLabel?: string;
	persistence?: ModePersistenceOptions;
	onChange?: (enabled: boolean, ctx: ExtensionContext) => void;
}

export interface ModeToggle {
	readonly id: string;
	readonly name: string;
	readonly persistenceScope: ModePersistenceScope;
	isEnabled(): boolean;
	setEnabled(enabled: boolean, ctx: ExtensionContext): void;
	toggle(ctx: ExtensionContext): void;
	syncStatus(ctx: ExtensionContext): void;
	onSessionStart(ctx: ExtensionContext): void;
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

interface PersistedModeState {
	enabled: boolean;
	modeId: string;
	scope: ModePersistenceScope;
	updatedAt: string;
	cwd?: string;
	sessionId?: string;
	gitBranch?: string;
}

const DEFAULT_PERSISTENCE_SCOPE: ModePersistenceScope = 'none';
const PROJECT_STATE_ROOT = '.pi-mode-toggler';
const GLOBAL_STATE_ROOT = join(
	homedir(),
	'.pi',
	'agent',
	'state',
	'pi-mode-toggler'
);

const encodePathSegment = (value: string): string => encodeURIComponent(value);

const getPersistenceScope = (
	options: CreateModeToggleOptions
): ModePersistenceScope => {
	return options.persistence?.scope ?? DEFAULT_PERSISTENCE_SCOPE;
};

const resolveGitBranch = (cwd: string): string | undefined => {
	try {
		const branch = execFileSync('git', ['branch', '--show-current'], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
		if (branch.length > 0) return branch;

		const detachedHead = execFileSync(
			'git',
			['rev-parse', '--short', 'HEAD'],
			{
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore']
			}
		).trim();
		return detachedHead.length > 0 ? `detached-${detachedHead}` : undefined;
	} catch {
		return undefined;
	}
};

const resolveStateFile = (
	modeId: string,
	scope: ModePersistenceScope,
	ctx: ExtensionContext
): string | undefined => {
	const projectStateRoot = join(
		ctx.sessionManager.getSessionDir(),
		PROJECT_STATE_ROOT
	);
	const encodedModeId = `${encodePathSegment(modeId)}.json`;

	switch (scope) {
		case 'none':
			return undefined;
		case 'session':
			return join(
				projectStateRoot,
				'session',
				encodePathSegment(ctx.sessionManager.getSessionId()),
				encodedModeId
			);
		case 'project':
			return join(projectStateRoot, 'project', encodedModeId);
		case 'branch': {
			const gitBranch = resolveGitBranch(ctx.cwd);
			return gitBranch
				? join(
						projectStateRoot,
						'branch',
						encodePathSegment(gitBranch),
						encodedModeId
					)
				: join(projectStateRoot, 'project', encodedModeId);
		}
		case 'global':
			return join(GLOBAL_STATE_ROOT, encodedModeId);
	}
};

const readPersistedState = (
	modeId: string,
	scope: ModePersistenceScope,
	ctx: ExtensionContext
): boolean | undefined => {
	const filePath = resolveStateFile(modeId, scope, ctx);
	if (!filePath) return undefined;

	try {
		const parsed = JSON.parse(
			readFileSync(filePath, 'utf8')
		) as Partial<PersistedModeState>;
		return typeof parsed.enabled === 'boolean' ? parsed.enabled : undefined;
	} catch (error) {
		const record = error as { code?: string };
		if (record.code === 'ENOENT') return undefined;
		throw error;
	}
};

const writePersistedState = (
	modeId: string,
	scope: ModePersistenceScope,
	enabled: boolean,
	ctx: ExtensionContext
): void => {
	const filePath = resolveStateFile(modeId, scope, ctx);
	if (!filePath) return;

	const gitBranch =
		scope === 'branch' ? resolveGitBranch(ctx.cwd) : undefined;
	const payload: PersistedModeState = {
		enabled,
		modeId,
		scope,
		updatedAt: new Date().toISOString(),
		cwd: ctx.cwd,
		sessionId: ctx.sessionManager.getSessionId(),
		...(gitBranch ? { gitBranch } : {})
	};

	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

export const createModeToggle = (
	pi: ExtensionAPI,
	options: CreateModeToggleOptions
): ModeToggle => {
	const name = options.name ?? options.id;
	const enabledLabel = options.enabledLabel ?? `${name} mode enabled`;
	const disabledLabel = options.disabledLabel ?? `${name} mode disabled`;
	const persistenceScope = getPersistenceScope(options);

	let enabled = false;
	let lastPromptEnabled: boolean | undefined;

	const getStatusMessage = (): string => {
		return enabled ? enabledLabel : disabledLabel;
	};

	const emitRegistration = (): void => {
		const registration: ModeRegistration = {
			id: options.id,
			name,
			color: options.color,
			persistenceScope,
			...(options.description
				? { description: options.description }
				: {}),
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

	const restorePersistedState = (ctx: ExtensionContext): void => {
		if (persistenceScope === 'none') return;
		const persistedEnabled = readPersistedState(
			options.id,
			persistenceScope,
			ctx
		);
		if (typeof persistedEnabled === 'boolean') {
			enabled = persistedEnabled;
		}
	};

	const persistState = (ctx: ExtensionContext): void => {
		if (persistenceScope === 'none') return;
		writePersistedState(options.id, persistenceScope, enabled, ctx);
	};

	const mode: ModeToggle = {
		id: options.id,
		name,
		persistenceScope,
		isEnabled: () => enabled,
		setEnabled: (nextEnabled, ctx) => {
			if (enabled === nextEnabled) return;
			enabled = nextEnabled;

			try {
				persistState(ctx);
			} catch {
				ctx.ui.notify(
					`Failed to persist ${name} mode state`,
					'warning'
				);
			}

			syncStatus(ctx);
			ctx.ui.notify(getStatusMessage(), 'info');
			options.onChange?.(enabled, ctx);
		},
		toggle: (ctx) => {
			mode.setEnabled(!enabled, ctx);
		},
		syncStatus: (ctx) => {
			syncStatus(ctx);
		},
		onSessionStart: (ctx) => {
			try {
				restorePersistedState(ctx);
			} catch {
				ctx.ui.notify(
					`Failed to restore ${name} mode state`,
					'warning'
				);
			}

			emitRegistration();
			syncStatus(ctx);
			lastPromptEnabled = ctx.sessionManager
				.getBranch()
				.some(
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
			const statusChanged =
				lastPromptEnabled !== undefined &&
				lastPromptEnabled !== enabled;
			lastPromptEnabled = enabled;

			if (!enabled && !statusChanged) return undefined;

			return {
				...(statusChanged
					? {
							message: {
								customType: options.id,
								content: getStatusMessage(),
								display: true as const
							}
						}
					: {}),
				...(enabled && systemPrompt
					? {
							systemPrompt: `${event.systemPrompt}\n\n${systemPrompt}`
						}
					: {})
			};
		}
	};

	emitRegistration();
	return mode;
};
