import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { WriteIntent } from '../../WriteIntent.ts';
import { writeIntentContentProspective } from './writeIntentContentProspective.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const writeIntentContentActual = (intent: WriteIntentValue): string =>
	writeIntentContentProspective(intent);

export const writeIntentContentActualAtom = (intent: WriteIntentValue) =>
	make(writeIntentContentActual(intent));
