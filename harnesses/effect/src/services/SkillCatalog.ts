import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Order,
	Path,
	Predicate,
	Ref
} from 'effect';
import { sort } from 'effect/Array';

import { normalizePath } from 'pi-harness-kit/kernel/path/normalizePath.ts';
import { SkillIndexEntry } from 'pi-harness-kit/SkillIndexEntry.ts';

const skillIndexEntryOrder = Order.mapInput(
	Order.String,
	(entry: SkillIndexEntry.Value) => entry.name
);

const chooseLongestPath = (
	left: SkillIndexEntry.Value | undefined,
	right: SkillIndexEntry.Value
): SkillIndexEntry.Value =>
	left === undefined || right.skillDir.length > left.skillDir.length
		? right
		: left;

interface CommandInfo {
	readonly source: string;
	readonly sourceInfo?: {
		readonly path?: string;
	};
}

const commandInfoFromUnknown = (value: unknown): CommandInfo | undefined => {
	if (!Predicate.isReadonlyObject(value)) {
		return undefined;
	}
	const source = value.source;
	if (typeof source !== 'string') {
		return undefined;
	}
	if (!Predicate.isReadonlyObject(value.sourceInfo)) {
		return { source };
	}
	const path = value.sourceInfo.path;
	return typeof path === 'string'
		? { source, sourceInfo: { path } }
		: { source };
};

export namespace SkillCatalog {
	export interface Interface {
		readonly rebuild: (
			commands: ReadonlyArray<unknown>,
			cwd: string
		) => Effect.Effect<void>;
		readonly entries: Effect.Effect<ReadonlyArray<SkillIndexEntry.Value>>;
		readonly normalizePath: (
			value: string,
			cwd: string
		) => Effect.Effect<string>;
		readonly matchPath: (
			absPath: string
		) => Effect.Effect<Option.Option<SkillIndexEntry.Value>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-harness/effect/SkillCatalog'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const fileSystem = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const entries = yield* Ref.make<
				ReadonlyArray<SkillIndexEntry.Value>
			>([]);

			const normalize = (value: string, cwd: string) =>
				normalizePath({ cwd, fileSystem, path, value });

			const toIndexEntry = (cwd: string, command: CommandInfo) =>
				command.source !== 'skill' ||
					typeof command.sourceInfo?.path !== 'string'
					? Effect.succeed(Option.none<SkillIndexEntry.Value>())
					: normalize(command.sourceInfo.path, cwd).pipe(
						Effect.map((skillFilePath) => {
							const skillDir = path.dirname(skillFilePath);
							const name = path.basename(skillDir);
							return name.startsWith('effect-')
								? Option.some(
									new SkillIndexEntry.Value({
										name,
										skillFilePath,
										skillDir
									})
								)
								: Option.none<SkillIndexEntry.Value>();
						})
					);

			const rebuild = Effect.fn('SkillCatalog.rebuild')(function*(
				commands: ReadonlyArray<unknown>,
				cwd: string
			) {
				const typedCommands = commands.flatMap((command) => {
					const info = commandInfoFromUnknown(command);
					return info === undefined ? [] : [info];
				});
				const resolvedEntries = yield* Effect.forEach(
					typedCommands,
					(command) => toIndexEntry(cwd, command)
				).pipe(
					Effect.map((options) =>
						options.flatMap((entry) =>
							Option.match(entry, {
								onNone: () => [],
								onSome: (value) => [value]
							})
						)
					)
				);
				const deduped = [
					...resolvedEntries.reduce<
						Map<string, SkillIndexEntry.Value>
					>(
						(byName, entry) =>
							new Map(byName).set(
								entry.name,
								chooseLongestPath(byName.get(entry.name), entry)
							),
						new Map<string, SkillIndexEntry.Value>()
					).values()
				];
				yield* Ref.set(entries, sort(deduped, skillIndexEntryOrder));
			});

			const matchPath = Effect.fn('SkillCatalog.matchPath')(function*(
				absPath: string
			) {
				const currentEntries = yield* Ref.get(entries);
				const matched = currentEntries.reduce<
					SkillIndexEntry.Value | undefined
				>(
					(best, entry) =>
						absPath !== entry.skillFilePath &&
							!absPath.startsWith(`${entry.skillDir}${path.sep}`)
							? best
							: chooseLongestPath(best, entry),
					undefined
				);
				return matched === undefined
					? Option.none()
					: Option.some(matched);
			});

			return Service.of({
				rebuild,
				entries: Ref.get(entries),
				normalizePath: normalize,
				matchPath
			});
		})
	);
}
