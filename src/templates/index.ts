/**
 * Template system for Invariance Protocol.
 *
 * @example
 * ```typescript
 * import { TemplateBuilder, TemplateRegistry, TemplateVerifier } from '@invariance/sdk';
 *
 * // Create a template with the builder
 * const template = TemplateBuilder.create('my-transfer')
 *   .requireSignature(agentAddress)
 *   .requireBalance(USDC, 1000n)
 *   .limitPerAddress(10, 3600)
 *   .build();
 *
 * // Register and verify
 * const verifier = new TemplateVerifier();
 * verifier.registerTemplate(template);
 * const result = await verifier.checkTemplate('my-transfer', action, context);
 * ```
 */

// Core classes
export { BaseTemplate } from './base.js';
export type { TemplateConstructor } from './base.js';

export { TemplateRegistry, globalRegistry } from './registry.js';

export { TemplateBuilder } from './builder.js';

export { TemplateValidator, templateValidator } from './validator.js';
export type { ValidationError, ValidationResult } from './validator.js';

// Authorization checkers
export * from './authorization/index.js';

// Condition checkers
export * from './conditions/index.js';

// Timing checkers
export * from './timing/index.js';

// Rate limit checkers
export * from './rate-limiting/index.js';

// Execution handlers
export * from './execution/index.js';

// Prebuilt templates
export * from './prebuilt/index.js';
