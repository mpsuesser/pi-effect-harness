import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';
import { editReplacementResolution } from './editReplacementResolution.ts';

export const editReplacementResolvedSpan = (
	replacement: EditReplacement.Value,
	source: string
): EditReplacement.Span | undefined => {
	const current = editReplacementResolution(replacement, source);
	return current instanceof EditReplacement.UniqueMatch
		? current.span
		: undefined;
};

export const editReplacementResolvedSpanAtom = (
	replacement: EditReplacement.Value,
	source: string
) => make(editReplacementResolvedSpan(replacement, source));
