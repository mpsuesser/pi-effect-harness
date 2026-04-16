import { make } from 'effect/unstable/reactivity/Atom';

import { Pattern } from '../../Pattern.ts';

export const globMatches = (
	pattern: Pattern.Value,
	filePath?: string
): boolean => {
	if (pattern.glob === undefined) {
		return true;
	}
	if (filePath === undefined) {
		return false;
	}
	return pattern.glob === filePath || filePath.endsWith(pattern.glob);
};

export const atom = (pattern: Pattern.Value, filePath?: string) =>
	make(globMatches(pattern, filePath));
