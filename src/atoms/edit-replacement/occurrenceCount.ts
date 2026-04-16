import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';

export const occurrenceCount = (
	replacement: EditReplacement.Value,
	source: string
): number =>
	replacement.oldText.length === 0
		? 0
		: source.split(replacement.oldText).length - 1;

export const atom = (replacement: EditReplacement.Value, source: string) =>
	make(occurrenceCount(replacement, source));
