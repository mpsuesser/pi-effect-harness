import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';
import { editReplacementOccurrenceCount } from './editReplacementOccurrenceCount.ts';

export const editReplacementResolution = (
	replacement: EditReplacement.Value,
	source: string
) => {
	if (replacement.oldText.length === 0) {
		return new EditReplacement.EmptyOldText({});
	}

	const count = editReplacementOccurrenceCount(replacement, source);
	if (count === 0) {
		return new EditReplacement.MissingMatch({});
	}
	if (count > 1) {
		return new EditReplacement.AmbiguousMatch({ occurrenceCount: count });
	}

	const start = source.indexOf(replacement.oldText);
	return new EditReplacement.UniqueMatch({
		span: new EditReplacement.Span({
			start,
			end: start + replacement.oldText.length
		})
	});
};

export const editReplacementResolutionAtom = (
	replacement: EditReplacement.Value,
	source: string
) => make(editReplacementResolution(replacement, source));
