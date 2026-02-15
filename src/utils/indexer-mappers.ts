import type {
  ActorType,
  ActorReference,
  Identity,
  LedgerEntry,
  IntentResult,
  ProofBundle,
  SpecPolicy,
  EscrowContract,
  Listing,
  ReputationScore,
  Review,
  ReviewSummary,
} from '@invariance/common';

const ACTOR_TYPES: ActorType[] = ['agent', 'human', 'device', 'service'];

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export function toTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    return value > 1e12 ? value : Math.floor(value * 1000);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) {
      return asNumber > 1e12 ? asNumber : Math.floor(asNumber * 1000);
    }
  }
  return 0;
}

function normalizeActorType(value: unknown): ActorType {
  if (typeof value === 'string' && ACTOR_TYPES.includes(value as ActorType)) {
    return value as ActorType;
  }
  return 'agent';
}

function normalizeActorArray(value: unknown): ActorType[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : String(item)))
    .map((item) => (ACTOR_TYPES.includes(item as ActorType) ? (item as ActorType) : null))
    .filter((v): v is ActorType => v !== null);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function parseJson(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function mapIdentityRow(row: Record<string, unknown>, explorerBase: string): Identity {
  const identityId = String(row['identity_id'] ?? row['identityId'] ?? '');
  const address = String(row['address'] ?? '');
  const createdAt = toTimestamp(row['created_at'] ?? row['createdAt']);

  return {
    identityId,
    type: normalizeActorType(row['actor_type'] ?? row['actorType']),
    address,
    owner: String(row['owner'] ?? ''),
    label: String(row['label'] ?? ''),
    capabilities: normalizeStringArray(row['capabilities']),
    status: (row['status'] as Identity['status']) ?? 'active',
    attestations: toNumber(row['attestation_count'] ?? row['attestationCount']),
    createdAt,
    txHash: String(row['tx_hash'] ?? row['txHash'] ?? ''),
    explorerUrl: identityId ? `${explorerBase}/identity/${identityId}` : '',
  };
}

export function mapPolicyRow(row: Record<string, unknown>): SpecPolicy {
  const rules = row['rules'];
  const actorTypes = normalizeActorArray(row['actor_types'] ?? row['actorTypes']);
  const actor: SpecPolicy['actor'] = actorTypes.length === 0
    ? null
    : actorTypes.length === 1
      ? actorTypes[0]!
      : actorTypes;

  return {
    policyId: String(row['policy_id'] ?? row['policyId'] ?? ''),
    name: String(row['name'] ?? ''),
    rules: Array.isArray(rules) ? rules : (rules ? (rules as unknown[]) : []),
    actor,
    state: (row['state'] as SpecPolicy['state']) ?? 'active',
    attachedTo: normalizeStringArray(row['attached_to']),
    createdAt: toTimestamp(row['created_at'] ?? row['createdAt']),
    txHash: String(row['tx_hash'] ?? row['txHash'] ?? ''),
  };
}

export function mapProof(row: Record<string, unknown>): ProofBundle {
  const proofHash = String(row['proof_hash'] ?? row['proofHash'] ?? '');
  const metadataHash = String(row['metadata_hash'] ?? row['metadataHash'] ?? row['params_hash'] ?? '');

  return {
    proofHash,
    signatures: {
      actor: '',
      platform: '',
      valid: Boolean(proofHash),
    },
    metadataHash,
    verifiable: Boolean(proofHash),
    raw: '',
  };
}

export function mapLedgerRow(row: Record<string, unknown>, explorerBase: string): LedgerEntry {
  const entryId = String(row['entry_id'] ?? row['entryId'] ?? '');
  const txHash = String(row['tx_hash'] ?? row['txHash'] ?? '');

  const actor: ActorReference = {
    type: normalizeActorType(row['actor_type'] ?? row['actorType']),
    address: String(row['actor_address'] ?? row['actorAddress'] ?? ''),
  };
  const actorIdentityId = row['actor_identity_id'];
  if (actorIdentityId) actor.identityId = String(actorIdentityId);

  return {
    entryId,
    action: String(row['action'] ?? ''),
    actor,
    category: String(row['category'] ?? ''),
    txHash,
    blockNumber: toNumber(row['block_number'] ?? row['blockNumber']),
    timestamp: toTimestamp(row['timestamp']),
    proof: mapProof(row),
    metadataHash: String(row['metadata_hash'] ?? row['metadataHash'] ?? ''),
    explorerUrl: txHash ? `${explorerBase}/tx/${txHash}` : '',
    ...(parseJson(row['metadata']) ? { metadata: parseJson(row['metadata']) } : {}),
  } as LedgerEntry;
}

export function mapIntentRow(row: Record<string, unknown>, explorerBase: string): IntentResult {
  const intentId = String(row['intent_id'] ?? row['intentId'] ?? '');
  const txHash = String(row['tx_hash'] ?? row['txHash'] ?? '');

  return {
    intentId,
    status: (row['status'] as IntentResult['status']) ?? 'pending',
    actor: (() => {
      const actor: ActorReference = {
        type: normalizeActorType(row['actor_type'] ?? row['actorType']),
        address: String(row['actor_address'] ?? row['actorAddress'] ?? ''),
      };
      const identityId = row['actor_identity_id'];
      if (identityId) actor.identityId = String(identityId);
      return actor;
    })(),
    action: String(row['action'] ?? ''),
    proof: mapProof(row),
    txHash,
    timestamp: toTimestamp(row['created_at'] ?? row['createdAt']),
    blockNumber: toNumber(row['block_number'] ?? row['blockNumber']),
    explorerUrl: txHash ? `${explorerBase}/tx/${txHash}` : '',
    logId: intentId,
  };
}

export function mapEscrowRow(row: Record<string, unknown>, explorerBase: string): EscrowContract {
  const escrowId = String(row['escrow_id'] ?? row['escrowId'] ?? '');
  const txHash = String(row['tx_hash'] ?? row['txHash'] ?? '');
  const conditionType = String(row['condition_type'] ?? row['conditionType'] ?? 'task-completion');

  return {
    escrowId,
    contractAddress: String(row['contract_address'] ?? row['contractAddress'] ?? ''),
    depositor: (() => {
      const actor: ActorReference = {
        type: normalizeActorType(row['depositor_actor_type']),
        address: String(row['depositor'] ?? ''),
      };
      const identityId = row['depositor_identity'];
      if (identityId) actor.identityId = String(identityId);
      return actor;
    })(),
    recipient: (() => {
      const actor: ActorReference = {
        type: normalizeActorType(row['recipient_actor_type']),
        address: String(row['recipient'] ?? ''),
      };
      const identityId = row['recipient_identity'];
      if (identityId) actor.identityId = String(identityId);
      return actor;
    })(),
    amount: String(row['amount'] ?? '0'),
    state: (row['state'] as EscrowContract['state']) ?? 'created',
    conditions: (() => {
      const conditions: EscrowContract['conditions'] = {
        type: conditionType as EscrowContract['conditions']['type'],
        timeout: String(row['timeout_seconds'] ?? row['timeoutSeconds'] ?? '0'),
      };
      if (row['arbiter']) conditions.arbiter = String(row['arbiter']);
      if (row['linked_policy_id']) conditions.linkedPolicyId = String(row['linked_policy_id']);
      return conditions;
    })(),
    createdAt: toTimestamp(row['created_at'] ?? row['createdAt']),
    txHash,
    explorerUrl: txHash ? `${explorerBase}/tx/${txHash}` : '',
  };
}

export function mapReputationScoreRow(row: Record<string, unknown>): ReputationScore {
  const overall = toNumber(row['overall'] ?? row['reputation_score'] ?? row['rep_overall']);
  const tier = String(row['tier'] ?? row['reputation_tier'] ?? row['rep_tier'] ?? 'unrated');

  return {
    overall,
    reliability: toNumber(row['reliability'] ?? row['rep_reliability']),
    speed: toNumber(row['speed'] ?? row['rep_speed']),
    volume: toNumber(row['volume'] ?? row['rep_volume']),
    consistency: toNumber(row['consistency'] ?? row['rep_consistency']),
    policyCompliance: toNumber(row['policy_compliance'] ?? row['rep_policy_compliance']),
    reviewAverage: toNumber(row['review_average'] ?? row['reviewAverage'] ?? row['rep_review_average']),
    reviewCount: toNumber(row['review_count'] ?? row['reviewCount'] ?? row['rep_review_count']),
    tier: tier as ReputationScore['tier'],
  };
}

export function mapReviewRow(row: Record<string, unknown>, explorerBase: string): Review {
  const reviewId = String(row['review_id'] ?? row['reviewId'] ?? '');
  const txHash = String(row['tx_hash'] ?? row['txHash'] ?? '');

  const categories: Record<string, number> = {};
  const quality = toNumber(row['quality_rating']);
  const communication = toNumber(row['communication_rating']);
  const speed = toNumber(row['speed_rating']);
  const value = toNumber(row['value_rating']);
  if (quality) categories['quality'] = quality;
  if (communication) categories['communication'] = communication;
  if (speed) categories['speed'] = speed;
  if (value) categories['value'] = value;

  const reviewer = (() => {
    const actor: ActorReference = {
      type: normalizeActorType(row['reviewer_actor_type']),
      address: String(row['reviewer_address'] ?? ''),
    };
    if (row['reviewer_identity']) actor.identityId = String(row['reviewer_identity']);
    return actor;
  })();

  const target = (() => {
    const actor: ActorReference = {
      type: normalizeActorType(row['target_actor_type']),
      address: String(row['target_address'] ?? ''),
    };
    if (row['target_identity']) actor.identityId = String(row['target_identity']);
    return actor;
  })();

  const review: Review = {
    reviewId,
    reviewer,
    target,
    escrowId: String(row['escrow_id'] ?? ''),
    rating: toNumber(row['rating']),
    timestamp: toTimestamp(row['timestamp']),
    txHash,
    verified: Boolean(row['verified']),
    explorerUrl: txHash ? `${explorerBase}/tx/${txHash}` : '',
  };

  if (row['comment']) review.comment = String(row['comment']);
  if (Object.keys(categories).length > 0) review.categories = categories;

  return review;
}

export function mapReviewSummary(avg: number, count: number): ReviewSummary {
  return {
    average: avg,
    count,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    recentReviews: [],
  };
}

export function mapListingRow(row: Record<string, unknown>, explorerBase: string): Listing {
  const identityRow: Record<string, unknown> = {
    identity_id: row['identity_id'] ?? row['identity_identity_id'],
    actor_type: row['identity_actor_type'],
    address: row['identity_address'],
    owner: row['identity_owner'],
    label: row['identity_label'],
    capabilities: row['identity_capabilities'],
    status: row['identity_status'],
    attestation_count: row['identity_attestation_count'],
    created_at: row['identity_created_at'],
    tx_hash: row['identity_tx_hash'],
  };

  const reputation = mapReputationScoreRow(row);
  const reviewAverage = toNumber(row['review_average'] ?? row['rep_review_average'] ?? row['reviewAverage']);
  const reviewCount = toNumber(row['review_count'] ?? row['rep_review_count'] ?? row['reviewCount']);

  const listingId = String(row['listing_id'] ?? row['listingId'] ?? '');
  const txHash = String(row['tx_hash'] ?? row['txHash'] ?? '');

  return {
    listingId,
    identity: mapIdentityRow(identityRow, explorerBase),
    name: String(row['name'] ?? ''),
    description: String(row['description'] ?? ''),
    category: row['category'] as Listing['category'],
    pricing: {
      type: String(row['pricing_type'] ?? row['pricingType'] ?? 'fixed') as Listing['pricing']['type'],
      amount: String(row['price_amount'] ?? row['priceAmount'] ?? '0'),
      currency: 'USDC',
    },
    capabilities: normalizeStringArray(row['capabilities']),
    reputation,
    reviewSummary: mapReviewSummary(reviewAverage, reviewCount),
    active: Boolean(row['active']),
    createdAt: toTimestamp(row['created_at'] ?? row['createdAt']),
    txHash,
    explorerUrl: listingId ? `${explorerBase}/listing/${listingId}` : '',
  };
}
