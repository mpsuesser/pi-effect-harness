import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';
import { resolution } from './resolution.ts';

export const resolvedSpan = (
	replacement: EditReplacement.Value,
	source: string
): EditReplacement.Span | undefined => {
	const current = resolution(replacement, source);
	return current instanceof EditReplacement.UniqueMatch
		? current.span
		: undefined;
};

export const atom = (replacement: EditReplacement.Value, source: string) =>
	make(resolvedSpan(replacement, source));
