import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from 'pi-harness-kit/UserMessage.ts';

const EFFECT_SKILL_REFERENCE_RE = /\beffect-[a-z0-9-]+\b/g;

export const userMessageReferencedEffectSkills = (
	message: UserMessage.Value
): ReadonlyArray<string> => [
	...(message.content.match(EFFECT_SKILL_REFERENCE_RE) ?? [])
];

export const userMessageReferencedEffectSkillsAtom = (
	message: UserMessage.Value
) => make(userMessageReferencedEffectSkills(message));
