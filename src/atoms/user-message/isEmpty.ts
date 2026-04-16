import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from '../../UserMessage.ts';

export const isEmpty = (message: UserMessage.Value): boolean =>
	message.content.trim().length === 0;

export const atom = (message: UserMessage.Value) => make(isEmpty(message));
