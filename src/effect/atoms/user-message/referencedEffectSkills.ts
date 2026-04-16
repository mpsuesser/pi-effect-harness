import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from '../../../UserMessage.ts';

const EFFECT_SKILL_REFERENCE_RE = /\beffect-[a-z0-9-]+\b/g;

export const referencedEffectSkills = (
	message: UserMessage.Value
): ReadonlyArray<string> => [
	...(message.content.match(EFFECT_SKILL_REFERENCE_RE) ?? [])
];

export const atom = (message: UserMessage.Value) =>
	make(referencedEffectSkills(message));
