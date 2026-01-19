import type { InterestingFactsResult } from '../types.js';
/**
 * Find outlier statistics for a geographic area
 */
export declare function getInterestingFacts(location: string, threshold?: number, limit?: number, category?: string): Promise<InterestingFactsResult | null>;
