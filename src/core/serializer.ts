import type { ActionInput, Action, ActionId } from '@invariance/common';
import { createActionId } from '@invariance/common';

/**
 * Serializes actions for contract submission.
 */
export class Serializer {
  /**
   * Serialize an action input to a full Action object.
   *
   * @param input - The action input
   * @returns The serialized action
   */
  serialize(input: ActionInput): Action {
    const id = this.generateActionId(input);

    return {
      id,
      type: input.type,
      params: input.params,
      timestamp: Date.now(),
    };
  }

  /**
   * Serialize action params to bytes for contract submission.
   *
   * @param params - The action parameters
   * @returns The encoded bytes
   */
  encodeParams(params: Record<string, unknown>): Uint8Array {
    // TODO(medium): @agent Implement proper ABI encoding
    // Context: Need to encode params in format expected by contracts
    // AC: Return ABI-encoded bytes that can be decoded by ExecutionLog contract
    const json = JSON.stringify(params);
    return new TextEncoder().encode(json);
  }

  /**
   * Generate a unique action ID.
   */
  private generateActionId(input: ActionInput): ActionId {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const hash = `${input.type}-${timestamp}-${random}`;
    return createActionId(hash);
  }
}
