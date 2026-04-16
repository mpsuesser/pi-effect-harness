import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from '../../UserMessage.ts';

export const content = (message: UserMessage.Value): string => message.content;

export const atom = (message: UserMessage.Value) => make(content(message));
