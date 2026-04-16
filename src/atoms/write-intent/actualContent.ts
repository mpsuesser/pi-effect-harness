import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { WriteIntent } from '../../WriteIntent.ts';
import { prospectiveContent } from './prospectiveContent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const actualContent = (intent: WriteIntentValue): string =>
	prospectiveContent(intent);

export const atom = (intent: WriteIntentValue) => make(actualContent(intent));
