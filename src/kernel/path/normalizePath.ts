import { Config, Effect, FileSystem, Option, Path } from 'effect';

const stripAtPrefix = (value: string): string =>
	value.startsWith('@') ? value.slice(1) : value;

const expandHome = (
	value: string,
	homeDirectory: Option.Option<string>,
	path: typeof Path.Path.Service
): string =>
	Option.match(homeDirectory, {
		onNone: () => value,
		onSome: (home) =>
			value === '~'
				? home
				: value.startsWith('~/')
				? path.join(home, value.slice(2))
				: value
	});

const resolveHomeDirectory = (): Effect.Effect<Option.Option<string>> =>
	Effect.gen(function*() {
		const home = yield* Config.option(Config.string('HOME'));
		if (Option.isSome(home)) {
			return home;
		}

		return yield* Config.option(Config.string('USERPROFILE'));
	}).pipe(
		Effect.catchTag('ConfigError', () => Effect.succeed(Option.none()))
	);

export const normalizePath = ({
	cwd,
	fileSystem,
	path,
	value
}: {
	readonly cwd: string;
	readonly fileSystem: typeof FileSystem.FileSystem.Service;
	readonly path: typeof Path.Path.Service;
	readonly value: string;
}) =>
	Effect.gen(function*() {
		const expanded = expandHome(
			stripAtPrefix(value.trim()),
			yield* resolveHomeDirectory(),
			path
		);
		const resolved = path.isAbsolute(expanded)
			? path.normalize(expanded)
			: path.resolve(cwd, expanded);
		return yield* fileSystem.realPath(resolved).pipe(
			Effect.catchTag('PlatformError', () => Effect.succeed(resolved))
		);
	});
