import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';
import { resolution } from './resolution.ts';

export const isApplicable = (
	replacement: EditReplacement.Value,
	source: string
): boolean =>
	resolution(replacement, source) instanceof EditReplacement.UniqueMatch;

export const atom = (replacement: EditReplacement.Value, source: string) =>
	make(isApplicable(replacement, source));
