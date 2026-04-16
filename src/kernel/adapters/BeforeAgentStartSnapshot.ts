import type { ExtensionContext } from '@mariozechner/pi-coding-agent';

import { ActiveBranch } from '../../ActiveBranch.ts';
import { fromEntries } from './BranchSnapshot.ts';

export const activeBranchFromContext = (
	ctx: Pick<ExtensionContext, 'sessionManager'>,
): ActiveBranch.Value => fromEntries(ctx.sessionManager.getBranch());
