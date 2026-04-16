import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { writeIntentContentRaw } from '../../../atoms/write-intent/writeIntentContentRaw.ts';
import { EFFECT_CODE_RE } from '../../../constants.ts';
import { WriteIntent } from '../../../WriteIntent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const writeIntentContainsEffectCode = (
	intent: WriteIntentValue
): boolean => EFFECT_CODE_RE.test(writeIntentContentRaw(intent));

export const writeIntentContainsEffectCodeAtom = (intent: WriteIntentValue) =>
	make(writeIntentContainsEffectCode(intent));
