import type { ComplianceFramework } from '@invariance/common';

/** Configuration for the ComplianceManager module. */
export interface ComplianceManagerConfig {
  /** API base URL for compliance endpoints */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
}

/** Options for checking compliance. */
export interface ComplianceCheckOptions {
  /** Framework to check against */
  framework: ComplianceFramework;
  /** Scope (address or entity identifier) */
  scope: string;
}

/** Result of a compliance check. */
export interface ComplianceCheckResult {
  /** Whether the entity is compliant */
  compliant: boolean;
  /** Framework checked */
  framework: ComplianceFramework;
  /** Issues found */
  issues: string[];
  /** Report reference (if generated) */
  reportId: string | null;
}

/** Options for requesting data erasure. */
export interface ErasureRequestOptions {
  /** Address of the data subject */
  requesterAddress: string;
  /** Specific data subjects to erase */
  dataSubjects: string[];
  /** Reason for erasure request */
  reason: string;
  /** Categories of data to erase */
  dataCategories?: string[];
}
