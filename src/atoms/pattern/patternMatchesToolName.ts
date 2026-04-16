import { make } from 'effect/unstable/reactivity/Atom';

import { Pattern } from '../../Pattern.ts';

export const patternMatchesToolName = (
	pattern: Pattern.Value,
	toolName: string
): boolean => new RegExp(pattern.toolRegex).test(toolName);

export const patternMatchesToolNameAtom = (
	pattern: Pattern.Value,
	toolName: string
) => make(patternMatchesToolName(pattern, toolName));
