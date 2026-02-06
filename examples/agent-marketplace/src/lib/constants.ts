/**
 * Static constants and demo data for the AI Agent Marketplace example.
 *
 * Since the SDK methods currently throw TODO errors (contract integration
 * pending), these mock listings let the UI render immediately.
 */
import type {
  Listing,
  ListingCategory,
  ReputationScore,
  ReviewSummary,
  Review,
  Identity,
} from '@invariance/sdk';

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

export interface CategoryInfo {
  label: string;
  icon: string;
  description: string;
}

export const CATEGORIES: Record<ListingCategory, CategoryInfo> = {
  trading: {
    label: 'Trading',
    icon: 'chart',
    description: 'Automated trading bots and strategy execution',
  },
  content: {
    label: 'Content',
    icon: 'document',
    description: 'Content generation, copywriting, and editing',
  },
  analysis: {
    label: 'Analysis',
    icon: 'magnifier',
    description: 'Data analysis, insights, and reporting',
  },
  automation: {
    label: 'Automation',
    icon: 'gear',
    description: 'Workflow automation and task orchestration',
  },
  research: {
    label: 'Research',
    icon: 'book',
    description: 'Deep research, literature review, and synthesis',
  },
  creative: {
    label: 'Creative',
    icon: 'brush',
    description: 'Art generation, music composition, and design',
  },
  development: {
    label: 'Development',
    icon: 'code',
    description: 'Code generation, review, and DevOps',
  },
  custom: {
    label: 'Custom',
    icon: 'star',
    description: 'Custom / uncategorized agent services',
  },
};

// ---------------------------------------------------------------------------
// Tier badge colors
// ---------------------------------------------------------------------------

export const TIER_COLORS: Record<ReputationScore['tier'], string> = {
  unrated: 'bg-gray-100 text-gray-600',
  bronze: 'bg-amber-100 text-amber-700',
  silver: 'bg-gray-200 text-gray-700',
  gold: 'bg-yellow-100 text-yellow-700',
  platinum: 'bg-indigo-100 text-indigo-700',
};

// ---------------------------------------------------------------------------
// Demo data helpers
// ---------------------------------------------------------------------------

const EXPLORER_BASE = 'https://sepolia.basescan.org/tx/';

function makeTxHash(seed: number): string {
  return `0x${seed.toString(16).padStart(64, 'a')}`;
}

function makeIdentity(
  id: string,
  label: string,
  caps: string[],
): Identity {
  return {
    identityId: id,
    type: 'agent',
    address: `0x${id.padStart(40, '0')}`,
    owner: `0x${'1'.padStart(40, '0')}`,
    label,
    capabilities: caps,
    status: 'active',
    attestations: 2,
    createdAt: Date.now() - 30 * 86_400_000,
    txHash: makeTxHash(parseInt(id, 16) || 1),
    explorerUrl: `${EXPLORER_BASE}${makeTxHash(parseInt(id, 16) || 1)}`,
  };
}

function makeReputation(
  overall: number,
  tier: ReputationScore['tier'],
  reviewAvg: number,
  reviewCount: number,
): ReputationScore {
  return {
    overall,
    reliability: overall - 2 + Math.random() * 4,
    speed: overall - 3 + Math.random() * 6,
    volume: reviewCount * 10,
    consistency: overall - 1 + Math.random() * 2,
    policyCompliance: 95 + Math.random() * 5,
    reviewAverage: reviewAvg,
    reviewCount,
    tier,
  };
}

function makeReviewSummary(avg: number, count: number): ReviewSummary {
  const reviews: Review[] = [];
  return {
    average: avg,
    count,
    distribution: {
      '1': Math.round(count * 0.02),
      '2': Math.round(count * 0.05),
      '3': Math.round(count * 0.13),
      '4': Math.round(count * 0.30),
      '5': Math.round(count * 0.50),
    },
    categoryAverages: {
      quality: avg,
      communication: avg - 0.2,
      speed: avg - 0.1,
      value: avg + 0.1,
    },
    recentReviews: reviews,
  };
}

// ---------------------------------------------------------------------------
// Demo listings
// ---------------------------------------------------------------------------

export const DEMO_LISTINGS: Listing[] = [
  {
    listingId: 'lst_001',
    identity: makeIdentity('a001', 'AlphaTrader', ['trading', 'defi', 'risk-management']),
    name: 'AlphaTrader Pro',
    description:
      'High-frequency DeFi trading agent with built-in risk management. Supports limit orders, TWAP, and portfolio rebalancing across Uniswap, Aave, and Compound.',
    category: 'trading',
    pricing: { type: 'per-task', amount: '75', currency: 'USDC' },
    capabilities: ['defi-trading', 'risk-management', 'portfolio-rebalancing', 'limit-orders'],
    reputation: makeReputation(92, 'platinum', 4.8, 234),
    reviewSummary: makeReviewSummary(4.8, 234),
    active: true,
    createdAt: Date.now() - 90 * 86_400_000,
    txHash: makeTxHash(0xa001),
    explorerUrl: `${EXPLORER_BASE}${makeTxHash(0xa001)}`,
  },
  {
    listingId: 'lst_002',
    identity: makeIdentity('a002', 'DataAnalyzer', ['analysis', 'reporting', 'visualization']),
    name: 'DataAnalyzer Pro',
    description:
      'Enterprise-grade data analysis agent. Processes CSV, SQL, and API data sources. Generates interactive dashboards, trend reports, and anomaly alerts.',
    category: 'analysis',
    pricing: { type: 'per-task', amount: '50', currency: 'USDC' },
    capabilities: ['data-analysis', 'visualization', 'csv-export', 'anomaly-detection'],
    reputation: makeReputation(88, 'gold', 4.6, 189),
    reviewSummary: makeReviewSummary(4.6, 189),
    active: true,
    createdAt: Date.now() - 60 * 86_400_000,
    txHash: makeTxHash(0xa002),
    explorerUrl: `${EXPLORER_BASE}${makeTxHash(0xa002)}`,
  },
  {
    listingId: 'lst_003',
    identity: makeIdentity('a003', 'ContentForge', ['writing', 'seo', 'social-media']),
    name: 'ContentForge AI',
    description:
      'AI content generation agent for blogs, landing pages, and social media. Optimizes for SEO, brand voice consistency, and engagement metrics.',
    category: 'content',
    pricing: { type: 'fixed', amount: '30', currency: 'USDC' },
    capabilities: ['blog-writing', 'seo-optimization', 'social-media', 'brand-voice'],
    reputation: makeReputation(85, 'gold', 4.5, 312),
    reviewSummary: makeReviewSummary(4.5, 312),
    active: true,
    createdAt: Date.now() - 45 * 86_400_000,
    txHash: makeTxHash(0xa003),
    explorerUrl: `${EXPLORER_BASE}${makeTxHash(0xa003)}`,
  },
  {
    listingId: 'lst_004',
    identity: makeIdentity('a004', 'AutomateX', ['workflows', 'zapier', 'integrations']),
    name: 'AutomateX',
    description:
      'End-to-end workflow automation agent. Connects APIs, schedules tasks, and handles error recovery. Supports Zapier, n8n, and custom webhook triggers.',
    category: 'automation',
    pricing: { type: 'hourly', amount: '20', currency: 'USDC' },
    capabilities: ['workflow-automation', 'api-integration', 'error-recovery', 'scheduling'],
    reputation: makeReputation(80, 'silver', 4.3, 97),
    reviewSummary: makeReviewSummary(4.3, 97),
    active: true,
    createdAt: Date.now() - 30 * 86_400_000,
    txHash: makeTxHash(0xa004),
    explorerUrl: `${EXPLORER_BASE}${makeTxHash(0xa004)}`,
  },
  {
    listingId: 'lst_005',
    identity: makeIdentity('a005', 'ResearchBot', ['research', 'summarization', 'citations']),
    name: 'DeepResearch Agent',
    description:
      'Academic and market research agent. Scans papers, reports, and datasets. Produces structured summaries with citations and confidence scores.',
    category: 'research',
    pricing: { type: 'per-task', amount: '100', currency: 'USDC' },
    capabilities: ['literature-review', 'market-research', 'summarization', 'citation-tracking'],
    reputation: makeReputation(90, 'gold', 4.7, 156),
    reviewSummary: makeReviewSummary(4.7, 156),
    active: true,
    createdAt: Date.now() - 75 * 86_400_000,
    txHash: makeTxHash(0xa005),
    explorerUrl: `${EXPLORER_BASE}${makeTxHash(0xa005)}`,
  },
  {
    listingId: 'lst_006',
    identity: makeIdentity('a006', 'CodePilot', ['code-review', 'refactoring', 'testing']),
    name: 'CodePilot AI',
    description:
      'AI-powered code review and refactoring agent. Supports TypeScript, Solidity, Python, and Rust. Generates tests, spots vulnerabilities, and suggests optimizations.',
    category: 'development',
    pricing: { type: 'per-task', amount: '60', currency: 'USDC' },
    capabilities: ['code-review', 'refactoring', 'test-generation', 'security-audit'],
    reputation: makeReputation(93, 'platinum', 4.9, 278),
    reviewSummary: makeReviewSummary(4.9, 278),
    active: true,
    createdAt: Date.now() - 120 * 86_400_000,
    txHash: makeTxHash(0xa006),
    explorerUrl: `${EXPLORER_BASE}${makeTxHash(0xa006)}`,
  },
];

// ---------------------------------------------------------------------------
// Demo hires for dashboard
// ---------------------------------------------------------------------------

export interface DemoHire {
  hireId: string;
  listing: Listing;
  task: string;
  amount: string;
  escrowState: 'created' | 'funded' | 'released' | 'refunded' | 'disputed' | 'expired';
  createdAt: number;
}

export const DEMO_HIRES: DemoHire[] = [
  {
    hireId: 'hire_001',
    listing: DEMO_LISTINGS[0]!,
    task: 'Rebalance DeFi portfolio across Uniswap V3 pools',
    amount: '75',
    escrowState: 'funded',
    createdAt: Date.now() - 2 * 86_400_000,
  },
  {
    hireId: 'hire_002',
    listing: DEMO_LISTINGS[1]!,
    task: 'Analyze Q4 2024 sales data and generate trend report',
    amount: '50',
    escrowState: 'released',
    createdAt: Date.now() - 10 * 86_400_000,
  },
  {
    hireId: 'hire_003',
    listing: DEMO_LISTINGS[5]!,
    task: 'Security audit for EscrowVault.sol',
    amount: '60',
    escrowState: 'funded',
    createdAt: Date.now() - 1 * 86_400_000,
  },
];

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const MARKETPLACE_STATS = {
  agentsListed: 1_247,
  jobsCompleted: 8_432,
  totalEscrowUsdc: '2,340,000',
};
