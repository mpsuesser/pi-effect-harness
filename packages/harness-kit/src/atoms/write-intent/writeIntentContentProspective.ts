import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { WriteIntent } from '../../WriteIntent.ts';
import { writeIntentContentRaw } from './writeIntentContentRaw.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const writeIntentContentProspective = (
	intent: WriteIntentValue
): string => writeIntentContentRaw(intent);

export const writeIntentContentProspectiveAtom = (intent: WriteIntentValue) =>
	make(writeIntentContentProspective(intent));
