/**
 * Ensure a shallow clone of the Effect v4 source code exists at
 * `${projectDir}/.references/effect-v4/`.
 *
 * The clone targets Effect-TS/effect-smol at the tag matching the
 * project's installed Effect version. Safe to call from multiple hooks
 * concurrently — only one clone runs at a time. Failures are silent
 * so the agent is never blocked by a failed clone.
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { GITHUB_REPO } from '../constants.ts';

const execFileAsync = promisify(execFile);

/** Shared promise to prevent concurrent clone operations. */
let clonePromise: Promise<void> | null = null;

const VERSION_FILE = '.pi-effect-enforcer-version';

/**
 * Read the version marker written by this extension after a successful clone.
 */
const readClonedTag = (refDir: string): string | null => {
	try {
		return (
			fs.readFileSync(path.join(refDir, VERSION_FILE), 'utf-8').trim() ||
			null
		);
	} catch {
		return null;
	}
};

export const ensureReferenceClone = async (
	projectDir: string,
	version: string
): Promise<void> => {
	const refDir = path.join(projectDir, '.references', 'effect-v4');
	const tag = `effect@${version}`;

	// Fast path: already cloned at the correct version
	if (fs.existsSync(path.join(refDir, '.git'))) {
		const existingTag = readClonedTag(refDir);
		if (existingTag === tag) return;

		// Version mismatch — remove stale clone so we re-clone
		try {
			fs.rmSync(refDir, { recursive: true, force: true });
		} catch {
			// Cannot remove — proceed without reference
			return;
		}
	}

	// Prevent concurrent clones
	if (clonePromise) return clonePromise;

	const tmpDir = `${refDir}.cloning`;

	clonePromise = (async () => {
		try {
			// Ensure parent directory exists
			fs.mkdirSync(path.join(projectDir, '.references'), {
				recursive: true
			});

			// Clean up any previous failed clone attempt
			if (fs.existsSync(tmpDir)) {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}

			await execFileAsync('git', [
				'clone',
				'--depth',
				'1',
				'--branch',
				tag,
				GITHUB_REPO,
				tmpDir
			]);
			fs.writeFileSync(path.join(tmpDir, VERSION_FILE), tag);

			// Atomic rename into place
			fs.renameSync(tmpDir, refDir);
		} catch {
			// Clone failed — clean up temp dir, continue without reference
			try {
				if (fs.existsSync(tmpDir)) {
					fs.rmSync(tmpDir, { recursive: true, force: true });
				}
			} catch {
				// Ignore cleanup errors
			}
		} finally {
			clonePromise = null;
		}
	})();

	return clonePromise;
};
