import {
	Config,
	Context,
	DateTime,
	Effect,
	FileSystem,
	Layer,
	Match,
	Option,
	Path,
	Schema
} from 'effect';

import { GitBranch } from './GitBranch.ts';

const PROJECT_STATE_ROOT = '.pi-mode-toggler';
const GLOBAL_STATE_ROOT_SEGMENTS = ['.pi', 'agent', 'state', 'pi-mode-toggler'];

const encodePathSegment = (value: string): string => encodeURIComponent(value);

class PersistedModeState extends Schema.Class<PersistedModeState>(
	'PersistedModeState'
)({
	enabled: Schema.Boolean,
	modeId: Schema.String,
	scope: Schema.Literals(['session', 'project', 'branch', 'global'] as const),
	updatedAt: Schema.String,
	cwd: Schema.optionalKey(Schema.String),
	sessionId: Schema.optionalKey(Schema.String),
	gitBranch: Schema.optionalKey(Schema.String)
}) {}

class ModePersistenceFailed
	extends Schema.TaggedErrorClass<ModePersistenceFailed>()(
		'ModePersistenceFailed',
		{
			message: Schema.String,
			path: Schema.optionalKey(Schema.String)
		}
	) {}

const decodePersistedModeState = Schema.decodeUnknownSync(
	Schema.fromJsonString(PersistedModeState)
);

const encodePersistedModeState = Schema.encodeSync(
	Schema.fromJsonString(PersistedModeState)
);

export namespace ModePersistence {
	export const Scope = Schema.Literals(
		[
			'none',
			'session',
			'project',
			'branch',
			'global'
		] as const
	);

	export type Scope = Schema.Schema.Type<typeof Scope>;

	export interface Location {
		readonly cwd: string;
		readonly modeId: string;
		readonly scope: Scope;
		readonly sessionDir: string;
		readonly sessionId: string;
	}

	export interface Interface {
		readonly load: (
			location: Location
		) => Effect.Effect<boolean | undefined, ModePersistenceFailed>;
		readonly save: (
			location: Location,
			enabled: boolean
		) => Effect.Effect<void, ModePersistenceFailed>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-enforcer/effect/ModePersistence'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const fs = yield* FileSystem.FileSystem;
			const gitBranch = yield* GitBranch.Service;
			const path = yield* Path.Path;

			const resolveHomeDirectory = (): Effect.Effect<
				string | undefined
			> => Effect.gen(function*() {
				const home = yield* Config.option(Config.string('HOME'));
				if (Option.isSome(home)) {
					return home.value;
				}

				const userProfile = yield* Config.option(
					Config.string('USERPROFILE')
				);
				return Option.isSome(userProfile)
					? userProfile.value
					: undefined;
			}).pipe(
				Effect.catchTag(
					'ConfigError',
					() => Effect.void.pipe(Effect.as(undefined))
				)
			);

			const resolveStateFile = (
				location: Location
			): Effect.Effect<string | undefined> => {
				const encodedModeId = `${
					encodePathSegment(location.modeId)
				}.json`;
				const projectStateRoot = path.join(
					location.sessionDir,
					PROJECT_STATE_ROOT
				);

				return Match.value(location.scope).pipe(
					Match.when(
						'none',
						() => Effect.void.pipe(Effect.as(undefined))
					),
					Match.when('session', () =>
						Effect.succeed(
							path.join(
								projectStateRoot,
								'session',
								encodePathSegment(location.sessionId),
								encodedModeId
							)
						)),
					Match.when('project', () =>
						Effect.succeed(
							path.join(
								projectStateRoot,
								'project',
								encodedModeId
							)
						)),
					Match.when('branch', () =>
						gitBranch.get(location.cwd).pipe(
							Effect.map((branch) =>
								branch !== undefined
									? path.join(
										projectStateRoot,
										'branch',
										encodePathSegment(branch),
										encodedModeId
									)
									: path.join(
										projectStateRoot,
										'project',
										encodedModeId
									)
							)
						)),
					Match.when('global', () =>
						resolveHomeDirectory().pipe(
							Effect.map((homeDirectory) =>
								homeDirectory === undefined
									? undefined
									: path.join(
										homeDirectory,
										...GLOBAL_STATE_ROOT_SEGMENTS,
										encodedModeId
									)
							)
						)),
					Match.exhaustive
				);
			};

			const load: Interface['load'] = (location) =>
				Effect.gen(function*() {
					const filePath = yield* resolveStateFile(location);
					if (filePath === undefined) {
						return undefined;
					}

					const exists = yield* fs.exists(filePath).pipe(
						Effect.mapError(
							() =>
								new ModePersistenceFailed({
									message: 'Failed to inspect mode state',
									path: filePath
								})
						)
					);
					if (!exists) {
						return undefined;
					}

					const content = yield* fs.readFileString(filePath).pipe(
						Effect.mapError(
							() =>
								new ModePersistenceFailed({
									message: 'Failed to read mode state',
									path: filePath
								})
						)
					);
					const persisted = yield* Effect.try({
						try: () => decodePersistedModeState(content),
						catch: () =>
							new ModePersistenceFailed({
								message: 'Mode state file is invalid JSON',
								path: filePath
							})
					});
					return persisted.enabled;
				});

			const save: Interface['save'] = (location, enabled) =>
				Effect.gen(function*() {
					const filePath = yield* resolveStateFile(location);
					if (filePath === undefined) {
						return;
					}

					const branch = location.scope === 'branch'
						? yield* gitBranch.get(location.cwd)
						: undefined;
					const payload = new PersistedModeState({
						enabled,
						modeId: location.modeId,
						scope: location.scope === 'none'
							? 'project'
							: location.scope,
						updatedAt: DateTime.formatIso(yield* DateTime.now),
						cwd: location.cwd,
						sessionId: location.sessionId,
						...(branch !== undefined
							? { gitBranch: branch }
							: undefined)
					});
					const content = yield* Effect.try({
						try: () => `${encodePersistedModeState(payload)}\n`,
						catch: () =>
							new ModePersistenceFailed({
								message: 'Failed to encode mode state',
								path: filePath
							})
					});

					yield* fs
						.makeDirectory(path.dirname(filePath), {
							recursive: true
						})
						.pipe(
							Effect.mapError(
								() =>
									new ModePersistenceFailed({
										message:
											'Failed to create mode state directory',
										path: filePath
									})
							)
						);
					yield* fs.writeFileString(filePath, content).pipe(
						Effect.mapError(
							() =>
								new ModePersistenceFailed({
									message: 'Failed to write mode state',
									path: filePath
								})
						)
					);
				});

			return Service.of({ load, save });
		})
	);
}
