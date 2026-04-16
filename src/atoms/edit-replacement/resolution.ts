import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';
import { occurrenceCount } from './occurrenceCount.ts';

export const resolution = (
	replacement: EditReplacement.Value,
	source: string
) => {
	if (replacement.oldText.length === 0) {
		return new EditReplacement.EmptyOldText({});
	}

	const count = occurrenceCount(replacement, source);
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

export const atom = (replacement: EditReplacement.Value, source: string) =>
	make(resolution(replacement, source));
