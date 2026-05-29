import {
	Clock,
	Context,
	DateTime,
	Effect,
	FileSystem,
	Layer,
	Option,
	Order,
	Path,
	Ref,
	Schema,
	Semaphore
} from 'effect';
import { sort } from 'effect/Array';

import type { SkillIndexEntry } from 'pi-harness-kit/SkillIndexEntry.ts';

export type SkillReadSource = 'read-tool' | 'skill-command' | 'backfill';
export type SkillReadKind = 'skill-file' | 'skill-asset';

export class SkillReadRecord extends Schema.Class<SkillReadRecord>(
	'SkillReadRecord'
)({
	id: Schema.String,
	skillName: Schema.String,
	skillFilePath: Schema.String,
	skillDir: Schema.String,
	readPath: Schema.String,
	readKind: Schema.Literals(['skill-file', 'skill-asset']),
	source: Schema.Literals(['read-tool', 'skill-command', 'backfill']),
	cwd: Schema.String,
	sessionId: Schema.String,
	timestamp: Schema.String,
	timestampMillis: Schema.Number,
	sessionFile: Schema.optionalKey(Schema.String),
	toolCallId: Schema.optionalKey(Schema.String)
}) {}

export interface SkillReadSummaryRow {
	readonly skillName: string;
	readonly totalReads: number;
	readonly skillFileReads: number;
	readonly skillAssetReads: number;
	readonly readToolReads: number;
	readonly skillCommandReads: number;
	readonly backfillReads: number;
	readonly uniqueSessions: number;
	readonly lastReadAt: string;
}

export interface SkillReadSummary {
	readonly generatedAt: string;
	readonly generatedAtMillis: number;
	readonly logFile: string;
	readonly windowStart?: string;
	readonly windowStartMillis?: number;
	readonly totalReads: number;
	readonly knownSkillCount: number;
	readonly readSkillCount: number;
	readonly neglectedSkillNames: ReadonlyArray<string>;
	readonly rareSkillNames: ReadonlyArray<string>;
	readonly rows: ReadonlyArray<SkillReadSummaryRow>;
}

export interface RecordSkillReadInput {
	readonly source: SkillReadSource;
	readonly skill: SkillIndexEntry.Value;
	readonly readPath: string;
	readonly cwd: string;
	readonly sessionId: string;
	readonly sessionFile?: string;
	readonly toolCallId?: string;
}

export interface SummarizeSkillReadsInput {
	readonly knownSkillNames: ReadonlyArray<string>;
	readonly sinceDurationMillis?: number;
	readonly rareReadThreshold?: number;
}

const recordJson = (record: SkillReadRecord): string =>
	Schema.encodeSync(Schema.UnknownFromJsonString)(record);

const isoFromMillis = (millis: number): string =>
	Option.match(DateTime.make(millis), {
		onNone: () => `${millis}`,
		onSome: DateTime.formatIso
	});

const decodeRecordLine = (line: string): Option.Option<SkillReadRecord> => {
	const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line);
	return Option.flatMap(
		json,
		(value) => Schema.decodeUnknownOption(SkillReadRecord)(value)
	);
};

const skillReadKind = (
	skill: SkillIndexEntry.Value,
	readPath: string
): SkillReadKind =>
	readPath === skill.skillFilePath ? 'skill-file' : 'skill-asset';

const sourceCount = (
	records: ReadonlyArray<SkillReadRecord>,
	source: SkillReadSource
): number => records.filter((record) => record.source === source).length;

const kindCount = (
	records: ReadonlyArray<SkillReadRecord>,
	kind: SkillReadKind
): number => records.filter((record) => record.readKind === kind).length;

const latestRecord = (
	records: ReadonlyArray<SkillReadRecord>
): SkillReadRecord =>
	records.reduce((latest, record) =>
		record.timestampMillis > latest.timestampMillis ? record : latest
	);

const rowOrder = Order.combine(
	Order.mapInput(
		Order.flip(Order.Number),
		(row: SkillReadSummaryRow) => row.totalReads
	),
	Order.mapInput(Order.String, (row) => row.skillName)
);

const skillNameOrder = Order.String;

const formatRows = (rows: ReadonlyArray<SkillReadSummaryRow>): string =>
	rows.length === 0
		? '_No skill reads recorded in this window._'
		: [
			'| Skill | Reads | Sessions | Last read | Breakdown |',
			'|---|---:|---:|---|---|',
			...rows.map((row) =>
				`| ${row.skillName} | ${row.totalReads} | ${row.uniqueSessions} | ${row.lastReadAt} | ${row.skillFileReads} skill file, ${row.skillAssetReads} assets, ${row.skillCommandReads} commands |`
			)
		].join('\n');

const leastReadRows = (
	rows: ReadonlyArray<SkillReadSummaryRow>
): ReadonlyArray<SkillReadSummaryRow> =>
	sort(
		rows,
		Order.combine(
			Order.mapInput(
				Order.Number,
				(row: SkillReadSummaryRow) => row.totalReads
			),
			Order.mapInput(Order.String, (row) => row.skillName)
		)
	).slice(0, 12);

const formatList = (values: ReadonlyArray<string>): string =>
	values.length === 0
		? '_None_'
		: values.map((value) => `- ${value}`).join('\n');

export const formatSkillReadSummary = (summary: SkillReadSummary): string => {
	const window = summary.windowStart === undefined
		? 'all recorded time'
		: `since ${summary.windowStart}`;
	return [
		'# Effect skill read metrics',
		'',
		`Window: ${window}`,
		`Log: \`${summary.logFile}\``,
		'',
		`Total reads: ${summary.totalReads}`,
		`Skills read: ${summary.readSkillCount}/${summary.knownSkillCount}`,
		`Neglected skills: ${summary.neglectedSkillNames.length}`,
		`Rare skills (≤1 read): ${summary.rareSkillNames.length}`,
		'',
		'## Most-read skills',
		'',
		formatRows(summary.rows),
		'',
		'## Least-read skills',
		'',
		formatRows(leastReadRows(summary.rows)),
		'',
		'## Neglected skills',
		'',
		formatList(summary.neglectedSkillNames),
		'',
		'## Rare skills',
		'',
		formatList(summary.rareSkillNames)
	].join('\n');
};

export namespace SkillReadTelemetry {
	export interface Interface {
		readonly logFile: string;
		readonly recordRead: (
			input: RecordSkillReadInput
		) => Effect.Effect<SkillReadRecord>;
		readonly records: Effect.Effect<ReadonlyArray<SkillReadRecord>>;
		readonly summarize: (
			input: SummarizeSkillReadsInput
		) => Effect.Effect<SkillReadSummary>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-harness/effect/SkillReadTelemetry'
	) {}

	export const layer = (logFile: string) =>
		Layer.effect(
			Service,
			Effect.gen(function*() {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const semaphore = yield* Semaphore.make(1);
				const commandSequence = yield* Ref.make(0);

				const appendRecord = (record: SkillReadRecord) =>
					semaphore.withPermit(
						Effect.gen(function*() {
							yield* fs.makeDirectory(path.dirname(logFile), {
								recursive: true
							});
							yield* fs.writeFileString(
								logFile,
								`${recordJson(record)}\n`,
								{ flag: 'a' }
							);
						})
					);

				const nextSequence = Ref.updateAndGet(
					commandSequence,
					(value) => value + 1
				);

				const recordRead = Effect.fn('SkillReadTelemetry.recordRead')(
					function*(input: RecordSkillReadInput) {
						const timestampMillis = yield* Clock.currentTimeMillis;
						const sequence = input.toolCallId === undefined
							? yield* nextSequence
							: undefined;
						const timestamp = isoFromMillis(timestampMillis);
						const id = input.toolCallId === undefined
							? `${input.source}:${input.sessionId}:${timestampMillis}:${sequence}`
							: `${input.source}:${input.sessionId}:${input.toolCallId}`;
						const record = new SkillReadRecord({
							id,
							skillName: input.skill.name,
							skillFilePath: input.skill.skillFilePath,
							skillDir: input.skill.skillDir,
							readPath: input.readPath,
							readKind: skillReadKind(
								input.skill,
								input.readPath
							),
							source: input.source,
							cwd: input.cwd,
							sessionId: input.sessionId,
							timestamp,
							timestampMillis,
							...(input.sessionFile === undefined
								? undefined
								: { sessionFile: input.sessionFile }),
							...(input.toolCallId === undefined
								? undefined
								: { toolCallId: input.toolCallId })
						});
						yield* appendRecord(record).pipe(
							Effect.catch(() => Effect.void)
						);
						return record;
					}
				);

				const records = fs.readFileString(logFile).pipe(
					Effect.catch(() => Effect.succeed('')),
					Effect.map((content) =>
						content
							.split('\n')
							.map((line) => line.trim())
							.flatMap((line) => {
								if (line.length === 0) {
									return [];
								}
								const record = decodeRecordLine(line);
								return Option.match(record, {
									onNone: () => [],
									onSome: (value) => [value]
								});
							})
					)
				);

				const summarize = Effect.fn('SkillReadTelemetry.summarize')(
					function*(input: SummarizeSkillReadsInput) {
						const generatedAtMillis = yield* Clock
							.currentTimeMillis;
						const generatedAt = isoFromMillis(generatedAtMillis);
						const windowStartMillis =
							input.sinceDurationMillis === undefined
								? undefined
								: Math.max(
									0,
									generatedAtMillis -
										input.sinceDurationMillis
								);
						const windowStart = windowStartMillis === undefined
							? undefined
							: isoFromMillis(windowStartMillis);
						const allRecords = yield* records;
						const recordsInWindow = windowStartMillis === undefined
							? allRecords
							: allRecords.filter((record) =>
								record.timestampMillis >= windowStartMillis
							);
						const bySkill = recordsInWindow.reduce(
							(map, record) =>
								new Map(map).set(record.skillName, [
									...(map.get(record.skillName) ?? []),
									record
								]),
							new Map<string, ReadonlyArray<SkillReadRecord>>()
						);
						const knownSkillNames = sort(
							[...new Set(input.knownSkillNames)],
							skillNameOrder
						);
						const rows = sort(
							[...bySkill.entries()].map(
								([skillName, skillRecords]) => {
									const latest = latestRecord(skillRecords);
									return {
										skillName,
										totalReads: skillRecords.length,
										skillFileReads: kindCount(
											skillRecords,
											'skill-file'
										),
										skillAssetReads: kindCount(
											skillRecords,
											'skill-asset'
										),
										readToolReads: sourceCount(
											skillRecords,
											'read-tool'
										),
										skillCommandReads: sourceCount(
											skillRecords,
											'skill-command'
										),
										backfillReads: sourceCount(
											skillRecords,
											'backfill'
										),
										uniqueSessions: new Set(
											skillRecords.map((record) =>
												record.sessionId
											)
										).size,
										lastReadAt: latest.timestamp
									};
								}
							),
							rowOrder
						);
						const readSkillNames = new Set(
							rows.map((row) => row.skillName)
						);
						const rareReadThreshold = input.rareReadThreshold ?? 1;
						const neglectedSkillNames = knownSkillNames.filter(
							(skillName) => !readSkillNames.has(skillName)
						);
						const rareSkillNames = rows.flatMap((row) =>
							row.totalReads <= rareReadThreshold
								? [row.skillName]
								: []
						);

						return {
							generatedAt,
							generatedAtMillis,
							logFile,
							...(windowStart === undefined ||
									windowStartMillis === undefined
								? undefined
								: { windowStart, windowStartMillis }),
							totalReads: recordsInWindow.length,
							knownSkillCount: knownSkillNames.length,
							readSkillCount: readSkillNames.size,
							neglectedSkillNames,
							rareSkillNames,
							rows
						};
					}
				);

				return Service.of({
					logFile,
					recordRead,
					records,
					summarize
				});
			})
		);
}
