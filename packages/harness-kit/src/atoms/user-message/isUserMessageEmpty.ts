import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from '../../UserMessage.ts';

export const isUserMessageEmpty = (message: UserMessage.Value): boolean =>
	message.content.trim().length === 0;

export const isUserMessageEmptyAtom = (message: UserMessage.Value) =>
	make(isUserMessageEmpty(message));
