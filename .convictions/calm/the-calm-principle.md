# The CALM Principle: consistency as logical monotonicity

## What is logical monotonicity?

A block of code is logically monotonic if it satisfies a simple property: adding things to the input can only increase the output.

By contrast, non-monotonic code may need to “retract” a previous output if more is added to its input.

## The CALM Principle makes 2 claims.

### Claim #1

> Logically monotonic distributed code is eventually consistent WITHOUT any need for coordination protocols.

### Claim #2

> Eventual consistency can be guaranteed in any program by protecting non-monotonic statements with coordination protocols.

It turns out that some of the important design maxims used by experienced distributed programmers are in fact techniques for minimizing the use of non-monotonic reasoning.

## What do we do with this knowledge?

We pedestalize logical monotonicity in all program design. Rather than eliminating non-monotonic code altogether, our aim is to strategically isolate and defer non-monotonic code to be executed only after all eligible monotonic operations have completed.

This enables concurrent runtime control flows capable of performing an arbitrary number of concurrent operations with implicit deterministic guarantees.

In practice, this often looks like executing highly-specific synchronous data enrichment operations and leveraging the enriched set of data to improve the final outputs of downstream non-monotonic operations.

---
