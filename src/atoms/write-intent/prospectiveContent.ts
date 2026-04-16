import { Schema } from 'effect';
import { make } from 'effect/unstable/reactivity/Atom';

import { WriteIntent } from '../../WriteIntent.ts';
import { rawContent } from './rawContent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const prospectiveContent = (intent: WriteIntentValue): string =>
	rawContent(intent);

export const atom = (intent: WriteIntentValue) =>
	make(prospectiveContent(intent));
