import { make } from 'effect/unstable/reactivity/Atom';

import { Pattern } from '../../Pattern.ts';

export const patternGlobMatchesFilePath = (
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

export const patternGlobMatchesFilePathAtom = (
	pattern: Pattern.Value,
	filePath?: string
) => make(patternGlobMatchesFilePath(pattern, filePath));
