import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { rawContent } from '../../../atoms/write-intent/rawContent.ts';
import { EFFECT_CODE_RE } from '../../../constants.ts';
import { WriteIntent } from '../../../WriteIntent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const containsEffectCode = (intent: WriteIntentValue): boolean =>
	EFFECT_CODE_RE.test(rawContent(intent));

export const atom = (intent: WriteIntentValue) =>
	make(containsEffectCode(intent));
