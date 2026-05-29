/** Effect-smol repository URL for reference cloning. */
export const GITHUB_REPO = 'https://github.com/Effect-TS/effect-smol.git';

/** Minimum number of effect-* skills required before writing Effect code. */
export const MIN_EFFECT_SKILLS = 5;

/** Matches content containing Effect code (the word `Effect` or effect imports). */
export const EFFECT_CODE_RE = /\bEffect\b|from\s+['"]effect(?:\/[^'"]*)?['"]/;

/** Session entry name used to persist loaded Effect skills. */
export const SKILL_LOADED_ENTRY = 'pi-effect-harness:skill-loaded';

/** Session entry name used to persist each successful Effect skill read. */
export const SKILL_READ_ENTRY = 'pi-effect-harness:skill-read';

/** Footer label shown while Effect mode is enabled. */
export const EFFECT_STATUS = '\x1b[1;38;2;212;175;55meffect\x1b[0m';
