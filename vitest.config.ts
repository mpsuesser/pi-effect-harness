import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		setupFiles: ['./vitest.setup.ts'],
		include: [
			'packages/*/test/**/*.test.ts',
			'harnesses/*/test/**/*.test.ts'
		],
		passWithNoTests: true,
		globals: false,
		testTimeout: 30000,
		hookTimeout: 30000,
		pool: 'forks',
		isolate: false
	}
});
