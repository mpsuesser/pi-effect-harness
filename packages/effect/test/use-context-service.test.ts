import { testPattern } from './helpers/pattern-test-harness.ts';

testPattern({
	name: 'use-context-service',

	shouldMatch: [
		'class MyService extends ServiceMap.Service<MyService>()("@app/MyService", {})',
		'export class Foo extends ServiceMap.Service<Foo>()("Foo") {}'
	],
	shouldNotMatch: [
		'class MyService extends Context.Service<MyService>()("@app/MyService", {})',
		'const tag = "ServiceMap.Service"',
		'// ServiceMap.Service was renamed in beta.46',
		'Context.Service',
		// String / template / comment content
		'const hint = "use Context.Service, not ServiceMap.Service"',
		'const tmpl = `migrate ServiceMap.Service to Context.Service`',
		'/* ServiceMap.Service was deprecated */ const x = 1',
		// Different member access on ServiceMap
		'ServiceMap.empty',
		'ServiceMap.add(ctx, tag, value)'
	]
});
