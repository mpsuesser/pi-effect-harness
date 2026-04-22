/**
 * Pricing — domain logic for computing pharmaceutical item prices.
 *
 * @since 0.1.0
 */

import { Context, Effect, Layer, Schema } from 'effect';

// ───────────────────────────────────────────────────────────────────────────
// Errors
// ───────────────────────────────────────────────────────────────────────────

/**
 * Raised when an input price is negative or NaN.
 *
 * @category Errors
 */
export class InvalidBasePrice
	extends Schema.TaggedErrorClass<InvalidBasePrice>()(
		'InvalidBasePrice',
		{ value: Schema.Number, message: Schema.String },
		{ description: 'Base price must be a finite, non-negative number.' }
	) {}

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

/**
 * Surge multiplier applied when the `surge-pricing` feature flag is on.
 */
export const SURGE_MULTIPLIER = 6.5 as const;

// ───────────────────────────────────────────────────────────────────────────
// Helpers (non-exported, deliberately included)
// ───────────────────────────────────────────────────────────────────────────

const isValidPrice = (value: number): boolean =>
	Number.isFinite(value) && value >= 0;

// ───────────────────────────────────────────────────────────────────────────
// Service
// ───────────────────────────────────────────────────────────────────────────

/**
 * Capability surface of {@link Service}.
 */
export interface Interface {
	/**
	 * Compute the effective price for the given base, applying the surge
	 * multiplier when surge pricing is active.
	 */
	readonly getPrice: (
		basePrice: number
	) => Effect.Effect<number, InvalidBasePrice>;
}

/**
 * The `Pricing` service identity.
 */
export class Service extends Context.Service<Service, Interface>()(
	'amdu-demo/Pricing'
) {}

// ───────────────────────────────────────────────────────────────────────────
// Layer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Layer providing the default pricing implementation. Always applies the
 * surge multiplier for demo purposes.
 */
export const layer: Layer.Layer<Service, never, never> = Layer.succeed(
	Service,
	Service.of({
		getPrice: (basePrice) =>
			isValidPrice(basePrice)
				? Effect.succeed(basePrice * SURGE_MULTIPLIER)
				: Effect.fail(
					new InvalidBasePrice({
						value: basePrice,
						message: 'basePrice must be finite and non-negative'
					})
				)
	})
);
