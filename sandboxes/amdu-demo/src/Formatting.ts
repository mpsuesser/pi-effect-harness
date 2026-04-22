/**
 * Formatting utilities for the amdu-demo sandbox.
 *
 * @since 0.1.0
 */

/**
 * Format a USD amount with N decimals and a `$` prefix. Now configurable!
 */
export const formatUsd = (amount: number, fractionDigits = 2): string =>
	`$${amount.toFixed(fractionDigits)}`;

/**
 * Internal discount helper. Not exported — included to exercise amdu's
 * "non-exported top-level closures are included too" behavior.
 */
const halfPrice = (amount: number): number => amount / 2;

/**
 * Applies `halfPrice` and formats the result.
 */
export const formatHalf = (amount: number): string =>
	formatUsd(halfPrice(amount));

/**
 * A currency identifier, just to exercise the `type` alias surface.
 */
export type Currency = 'USD' | 'EUR' | 'GBP';

/**
 * An `as const` factory object to exercise the object-literal closure detection.
 */
export const Fmt = {
	usd: formatUsd,
	half: formatHalf
} as const;
