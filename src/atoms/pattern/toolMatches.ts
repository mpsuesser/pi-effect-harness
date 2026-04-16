import { make } from 'effect/unstable/reactivity/Atom';

import { Pattern } from '../../Pattern.ts';

export const toolMatches = (
	pattern: Pattern.Value,
	toolName: string
): boolean => new RegExp(pattern.toolRegex).test(toolName);

export const atom = (pattern: Pattern.Value, toolName: string) =>
	make(toolMatches(pattern, toolName));
