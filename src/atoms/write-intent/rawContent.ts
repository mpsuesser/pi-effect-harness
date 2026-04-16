import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { WriteIntent } from '../../WriteIntent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const rawContent = (intent: WriteIntentValue): string =>
	intent instanceof WriteIntent.WriteFile
		? intent.content
		: intent.replacements.map((replacement) => replacement.newText).join(
			'\n'
		);

export const atom = (intent: WriteIntentValue) => make(rawContent(intent));
