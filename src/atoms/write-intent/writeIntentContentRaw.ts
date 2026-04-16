import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { WriteIntent } from '../../WriteIntent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const writeIntentContentRaw = (intent: WriteIntentValue): string =>
	intent instanceof WriteIntent.WriteFile
		? intent.content
		: intent.replacements.map((replacement) => replacement.newText).join(
			'\n'
		);

export const writeIntentContentRawAtom = (intent: WriteIntentValue) =>
	make(writeIntentContentRaw(intent));
