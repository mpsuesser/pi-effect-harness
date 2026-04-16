import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';

export const editReplacementOccurrenceCount = (
	replacement: EditReplacement.Value,
	source: string
): number =>
	replacement.oldText.length === 0
		? 0
		: source.split(replacement.oldText).length - 1;

export const editReplacementOccurrenceCountAtom = (
	replacement: EditReplacement.Value,
	source: string
) => make(editReplacementOccurrenceCount(replacement, source));
