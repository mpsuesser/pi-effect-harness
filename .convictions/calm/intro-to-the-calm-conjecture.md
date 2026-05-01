---
url: https://databeta.wordpress.com/2010/10/28/the-calm-conjecture-reasoning-about-consistency/
access_date: 2025-08-29T11:21:33.000Z
tags: ACID, CALM, eventual consistency, logic, bloom, database, distributed systems, NoSQL, paxos, points of order, static analysis, transactions, two-phase commit
---

# The CALM Conjecture: Reasoning about Consistency

## Conventional Wisdom

In large distributed systems, perfect data consistency is too expensive to guarantee in general. “Eventually consistent” approaches are often a better choice, since temporary inconsistencies work out in most cases. Consistency mechanisms (transactions, quorums, etc.) should be reserved for infrequent, small-scale, mission-critical tasks.

Most computer systems designers agree on this at some level (once you get past the NoSQL vs. ACID sloganeering). But like lots of well-intentioned design maxims, it’s not so easy to translate into practice — all kinds of unavoidable tactical questions pop up.

## Questions

* Exactly where in my multifaceted system is eventual consistency “good enough”?
* How do I know that my “mission-critical” software isn’t tainted by my “best effort” components?
* How do I maintain my design maxim as software evolves? For example, how can the junior programmer in year n of a project reason about whether their piece of the code maintains the system’s overall consistency requirements?

If you think you have answers to those questions, I’d love to hear them. And then I’ll raise the stakes, because I have a better challenge for you: can you write down your answers in an algorithm?

# Challenge

Write a program checker that will either “bless” your code’s inconsistency as provably acceptable, or identify the locations of unacceptable consistency bugs.

The CALM Conjecture is my initial answer to that challenge.

CALM stands for “Consistency As Logical Monotonicity”. The idea is that the family of eventually consistent programs are exactly those that can be expressed in monotonic logic. By contrast, distributed non-monotonicity (e.g. destructive state modification, aggregation or “reduce”) can and must be resolved via distributed coordination logic (e.g. two-phase-commit, Paxos). The idea that “temporary inconsistencies work out” amounts to ensuring that the data in question is contained within a properly-protected monotonic component of the system.

Presuming that CALM can be proven with sufficient generality (restricted formal versions of it are obvious, but I’m quite sure there’s more that can be done), the next step is to translate this idea into a useful program checker. Like many other verification tasks, this is only tractable in a sufficiently high-level language — in this case, one where the constructs of the language can be translated into an underlying logic. Bloom is our language along these lines, and we have the initial program checks in place. Given a Bloom program, we can do the following:

1. bless programs as monotonic, and hence safe to run coordination-free
2. identify non-monotonic “Points of Order” in Bloom programs. These can be resolved by either of the following (which we intend to automate):
   * add coordination logic (e.g. quorum consensus) to enforce the ordering, or
   * augment the program to tag downstream data as “tainted” with potential inconsistency
3. visualize the Points of Order in a dependency graph, to help programmers reason about restructuring their code for more efficient consistency enforcement.
