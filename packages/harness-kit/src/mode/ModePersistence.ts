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
		) => Effect.Effect<Option.Option<boolean>, ModePersistenceFailed>;
		readonly save: (
			location: Location,
			enabled: boolean
		) => Effect.Effect<void, ModePersistenceFailed>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/mode/ModePersistence'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const fs = yield* FileSystem.FileSystem;
			const gitBranch = yield* GitBranch.Service;
			const path = yield* Path.Path;

			const inspectStateFile = Effect.fn(
				'ModePersistence.inspectStateFile'
			)(function*(filePath: string) {
				return yield* fs.exists(filePath).pipe(
					Effect.mapError(
						() =>
							new ModePersistenceFailed({
								message: 'Failed to inspect mode state',
								path: filePath
							})
					)
				);
			});

			type AncestorStateFileInput = {
				readonly relativeStatePath: string;
				readonly sessionDir: string;
			};

			const findAncestorStateFile: (
				input: AncestorStateFileInput
			) => Effect.Effect<
				Option.Option<string>,
				ModePersistenceFailed
			> = Effect.fn('ModePersistence.findAncestorStateFile')(function*({
				relativeStatePath,
				sessionDir
			}: AncestorStateFileInput) {
				const parent = path.dirname(sessionDir);
				if (parent === sessionDir) {
					return Option.none<string>();
				}

				const candidate = path.join(
					parent,
					PROJECT_STATE_ROOT,
					relativeStatePath
				);
				const exists = yield* inspectStateFile(candidate);
				return exists
					? Option.some(candidate)
					: yield* findAncestorStateFile({
						relativeStatePath,
						sessionDir: parent
					});
			});

			const ownProjectStateFile = (
				location: Location,
				segments: ReadonlyArray<string>
			): string =>
				path.join(
					location.sessionDir,
					PROJECT_STATE_ROOT,
					path.join(...segments)
				);

			const resolveProjectStateFile = Effect.fn(
				'ModePersistence.resolveProjectStateFile'
			)(function*({
				location,
				segments
			}: {
				readonly location: Location;
				readonly segments: ReadonlyArray<string>;
			}) {
				const relativeStatePath = path.join(...segments);
				const ownStateFile = ownProjectStateFile(location, segments);
				const exists = yield* inspectStateFile(ownStateFile);
				if (exists) {
					return ownStateFile;
				}

				const ancestorStateFile = yield* findAncestorStateFile({
					relativeStatePath,
					sessionDir: location.sessionDir
				});
				return Option.getOrElse(
					ancestorStateFile,
					() => ownStateFile
				);
			});

			const configOption = (name: string) =>
				Config.option(Config.string(name)).pipe(
					Effect.catchTag(
						'ConfigError',
						() => Effect.succeed(Option.none<string>())
					)
				);

			const resolveHomeDirectory = Effect.fn(
				'ModePersistence.resolveHomeDirectory'
			)(function*() {
				const home = yield* configOption('HOME');
				if (Option.isSome(home)) {
					return home;
				}

				return yield* configOption('USERPROFILE');
			});

			const resolveOwnStateFile = Effect.fn(
				'ModePersistence.resolveOwnStateFile'
			)(function*(location: Location) {
				const encodedModeId = `${
					encodePathSegment(location.modeId)
				}.json`;

				return yield* Match.value(location.scope).pipe(
					Match.when(
						'none',
						() => Effect.succeed(Option.none<string>())
					),
					Match.when('session', () =>
						Effect.succeed(
							Option.some(
								ownProjectStateFile(location, [
									'session',
									encodePathSegment(location.sessionId),
									encodedModeId
								])
							)
						)),
					Match.when('project', () =>
						Effect.succeed(
							Option.some(
								ownProjectStateFile(location, [
									'project',
									encodedModeId
								])
							)
						)),
					Match.when('branch', () =>
						gitBranch.get(location.cwd).pipe(
							Effect.map((branch) =>
								Option.some(
									Option.match(Option.fromNullishOr(branch), {
										onNone: () =>
											ownProjectStateFile(location, [
												'project',
												encodedModeId
											]),
										onSome: (branchName) =>
											ownProjectStateFile(location, [
												'branch',
												encodePathSegment(branchName),
												encodedModeId
											])
									})
								)
							)
						)),
					Match.when('global', () =>
						resolveHomeDirectory().pipe(
							Effect.map((homeDirectory) =>
								Option.match(homeDirectory, {
									onNone: () => Option.none<string>(),
									onSome: (home) =>
										Option.some(
											path.join(
												home,
												...GLOBAL_STATE_ROOT_SEGMENTS,
												encodedModeId
											)
										)
								})
							)
						)),
					Match.exhaustive
				);
			});

			const resolveStateFile = Effect.fn(
				'ModePersistence.resolveStateFile'
			)(function*(location: Location) {
				const encodedModeId = `${
					encodePathSegment(location.modeId)
				}.json`;

				return yield* Match.value(location.scope).pipe(
					Match.when(
						'none',
						() => Effect.succeed(Option.none<string>())
					),
					Match.when('session', () =>
						Effect.succeed(
							Option.some(
								path.join(
									location.sessionDir,
									PROJECT_STATE_ROOT,
									'session',
									encodePathSegment(location.sessionId),
									encodedModeId
								)
							)
						)),
					Match.when('project', () =>
						resolveProjectStateFile({
							location,
							segments: ['project', encodedModeId]
						}).pipe(Effect.map(Option.some))),
					Match.when('branch', () =>
						gitBranch.get(location.cwd).pipe(
							Effect.flatMap((branch) =>
								Option.match(Option.fromNullishOr(branch), {
									onNone: () =>
										resolveProjectStateFile({
											location,
											segments: ['project', encodedModeId]
										}),
									onSome: (branchName) =>
										resolveProjectStateFile({
											location,
											segments: [
												'branch',
												encodePathSegment(branchName),
												encodedModeId
											]
										})
								})
							),
							Effect.map(Option.some)
						)),
					Match.when('global', () =>
						resolveHomeDirectory().pipe(
							Effect.map((homeDirectory) =>
								Option.match(homeDirectory, {
									onNone: () => Option.none<string>(),
									onSome: (home) =>
										Option.some(
											path.join(
												home,
												...GLOBAL_STATE_ROOT_SEGMENTS,
												encodedModeId
											)
										)
								})
							)
						)),
					Match.exhaustive
				);
			});

			const load: Interface['load'] = Effect.fn(
				'ModePersistence.load'
			)(function*(location: Location) {
				const stateFile = yield* resolveStateFile(location);
				if (Option.isNone(stateFile)) {
					return Option.none<boolean>();
				}
				const filePath = stateFile.value;

				const exists = yield* inspectStateFile(filePath);
				if (!exists) {
					return Option.none<boolean>();
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
				return Option.some(persisted.enabled);
			});

			const save: Interface['save'] = Effect.fn(
				'ModePersistence.save'
			)(function*(location: Location, enabled: boolean) {
				const stateFile = yield* resolveOwnStateFile(location);
				if (Option.isNone(stateFile)) {
					return;
				}
				const filePath = stateFile.value;

				const branch = location.scope === 'branch'
					? yield* gitBranch.get(location.cwd).pipe(
						Effect.map(Option.fromNullishOr)
					)
					: Option.none<string>();
				const payload = new PersistedModeState({
					enabled,
					modeId: location.modeId,
					scope: location.scope === 'none'
						? 'project'
						: location.scope,
					updatedAt: DateTime.formatIso(yield* DateTime.now),
					cwd: location.cwd,
					sessionId: location.sessionId,
					...(Option.isSome(branch)
						? { gitBranch: branch.value }
						: {})
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
