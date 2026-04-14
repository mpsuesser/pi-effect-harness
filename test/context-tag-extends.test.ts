import { testPattern } from './pattern-test-harness.ts';

testPattern({
	name: 'context-tag-extends',
	shouldMatch: [
		'class MyServiceTag extends Context.Tag',
		'class FooTag extends Context.Tag<FooTag>() { }',
		'export class ParallelClientTag extends Context.Tag',
		'Context.GenericTag<ParallelService>',
		'Context.GenericTag<MyClientService>'
	],
	shouldNotMatch: [
		'Context.Service<ParallelClient>',
		'const MyClient = Context.Service<MyClient>()',
		'interface MyService { }',
		'class MyClass extends BaseClass { }',
		"Tag = 'value'"
	]
});
