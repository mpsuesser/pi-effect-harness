import { make } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from '../../EditReplacement.ts';
import { editReplacementResolution } from './editReplacementResolution.ts';

export const isEditReplacementApplicable = (
	replacement: EditReplacement.Value,
	source: string
): boolean =>
	editReplacementResolution(replacement, source) instanceof
		EditReplacement.UniqueMatch;

export const isEditReplacementApplicableAtom = (
	replacement: EditReplacement.Value,
	source: string
) => make(isEditReplacementApplicable(replacement, source));
