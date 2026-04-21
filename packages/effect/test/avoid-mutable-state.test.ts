import { testPattern } from './helpers/pattern-test-harness.ts';

testPattern({
	name: 'avoid-mutable-state',

	shouldMatch: [
		'let counter = 0',
		'let value: string',
		'let isReady = false',
		'let items: Array<string> = []'
	],
	shouldNotMatch: [
		'const counterRef = yield* Ref.make(0)',
		'const value = "hello"',
		'const isReady = true',
		'// let this be a comment',
		// String / template content mentioning `let`
		"const hint = 'use const, not let x = 1'",
		'const doc = "avoid let bindings"',
		'const tmpl = `prefer Ref over let x = 0`',
		// Block comment
		'/* let x = 1 is a smell */ const y = 1',
		// Identifiers that contain `let`
		'function letUserKnow() {}',
		'const outlet = makeOutlet()',
		'class Letter {}'
	]
});
