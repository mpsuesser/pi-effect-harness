/**
 * Ensure a shallow clone of the Effect v4 source code exists at
 * `~/.cache/effect-v4/`.
 *
 * The clone tracks the latest Effect v4 beta source in Effect-TS/effect-smol.
 * Safe to call from multiple hooks concurrently — only one clone/update runs
 * at a time in this process, with a lightweight cache lock to avoid
 * cross-process mutation races. Failures are silent so the agent is never
 * blocked by a failed clone or refresh.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { GITHUB_REPO } from '../constants.ts';

const execFileAsync = promisify(execFile);

const STALE_LOCK_MS = 10 * 60 * 1000;

/** Shared promise to prevent concurrent clone/update operations. */
let clonePromise: Promise<void> | null = null;

export const referenceCloneDir = (): string =>
	path.join(os.homedir(), '.cache', 'effect-v4');

const acquireCacheLock = (lockDir: string): boolean => {
	try {
		fs.mkdirSync(lockDir);
		return true;
	} catch {
		try {
			const ageMs = Date.now() - fs.statSync(lockDir).mtimeMs;
			if (ageMs <= STALE_LOCK_MS) return false;
			fs.rmSync(lockDir, { recursive: true, force: true });
			fs.mkdirSync(lockDir);
			return true;
		} catch {
			return false;
		}
	}
};

const ensureFreshExistingClone = async (refDir: string): Promise<void> => {
	await execFileAsync('git', [
		'-C',
		refDir,
		'remote',
		'set-url',
		'origin',
		GITHUB_REPO
	]);
	await execFileAsync('git', [
		'-C',
		refDir,
		'fetch',
		'--depth',
		'1',
		'origin'
	]);
	await execFileAsync('git', [
		'-C',
		refDir,
		'remote',
		'set-head',
		'origin',
		'--auto'
	]);
	await execFileAsync('git', [
		'-C',
		refDir,
		'reset',
		'--hard',
		'origin/HEAD'
	]);
	await execFileAsync('git', ['-C', refDir, 'clean', '-fd']);
};

const cloneFreshReference = async (refDir: string): Promise<void> => {
	const parentDir = path.dirname(refDir);
	const tmpDir = `${refDir}.cloning`;

	fs.mkdirSync(parentDir, { recursive: true });
	fs.rmSync(tmpDir, { recursive: true, force: true });
	fs.rmSync(refDir, { recursive: true, force: true });

	await execFileAsync('git', [
		'clone',
		'--depth',
		'1',
		'--single-branch',
		GITHUB_REPO,
		tmpDir
	]);

	fs.renameSync(tmpDir, refDir);
};

export const ensureReferenceClone = async (): Promise<void> => {
	if (clonePromise) return clonePromise;

	clonePromise = (async () => {
		const refDir = referenceCloneDir();
		const parentDir = path.dirname(refDir);
		const tmpDir = `${refDir}.cloning`;
		const lockDir = `${refDir}.lock`;
		let lockAcquired = false;

		try {
			fs.mkdirSync(parentDir, { recursive: true });
			lockAcquired = acquireCacheLock(lockDir);
			if (!lockAcquired) return;

			if (fs.existsSync(path.join(refDir, '.git'))) {
				await ensureFreshExistingClone(refDir);
				return;
			}

			await cloneFreshReference(refDir);
		} catch {
			// Clone/update failed — clean up temp dir, continue without reference.
			if (lockAcquired) {
				try {
					fs.rmSync(tmpDir, { recursive: true, force: true });
				} catch {
					// Ignore cleanup errors.
				}
			}
		} finally {
			if (lockAcquired) {
				fs.rmSync(lockDir, { recursive: true, force: true });
			}
			clonePromise = null;
		}
	})();

	return clonePromise;
};
