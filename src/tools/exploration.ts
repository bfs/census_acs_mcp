import { query } from '../db.js';
import { resolveLocation } from './lookup.js';
import type { InterestingFactsResult, InterestingFact } from '../types.js';

// Topic category keywords for optional filtering
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  demographics: ['age', 'sex', 'race', 'ethnic', 'population', 'citizen'],
  income: ['income', 'poverty', 'earnings', 'wage', 'salary'],
  employment: ['employ', 'occupation', 'labor', 'workforce', 'job', 'unemploy'],
  education: ['education', 'school', 'degree', 'college', 'enroll'],
  housing: ['housing', 'rent', 'mortgage', 'home', 'tenure', 'owner', 'vacant'],
  health: ['health', 'disability', 'insurance', 'disab'],
  transportation: ['transport', 'commut', 'travel', 'vehicle', 'car'],
  language: ['language', 'english', 'foreign', 'native', 'immigr', 'birth'],
  internet: ['internet', 'computer', 'broadband', 'device'],
  family: ['family', 'household', 'marital', 'married', 'child', 'fertil'],
};

/**
 * Find outlier statistics for a geographic area
 */
export async function getInterestingFacts(
  location: string,
  threshold: number = 0.05,
  limit: number = 20,
  category?: string
): Promise<InterestingFactsResult | null> {
  const resolved = await resolveLocation(location);
  if (!resolved) {
    return null;
  }

  const { geo_id, name } = resolved;

  // Build category filter if specified
  let categoryFilter = '';
  const params: unknown[] = [geo_id, 1 - threshold, threshold];

  if (category && CATEGORY_KEYWORDS[category.toLowerCase()]) {
    const keywords = CATEGORY_KEYWORDS[category.toLowerCase()];
    const conditions = keywords.map(() => 'm.title ILIKE ?').join(' OR ');
    categoryFilter = `AND (${conditions})`;
    params.push(...keywords.map((kw) => `%${kw}%`));
  }

  params.push(limit);

  // Find metrics where this area is an outlier
  const results = await query<{
    table_id: string;
    title: string;
    label: string;
    estimate: number;
    national_percentile: number;
  }>(
    `SELECT 
       m.table_id,
       m.title,
       m.label,
       p.estimate,
       p.national_percentile
     FROM pct_db.acs_with_percentiles p
     JOIN pct_db.table_metadata m ON p.uid = m.unique_id
     WHERE p.geo_id = ?
       AND (p.national_percentile > ? OR p.national_percentile < ?)
       ${categoryFilter}
     ORDER BY ABS(p.national_percentile - 0.5) DESC
     LIMIT ?`,
    params
  );

  const facts: InterestingFact[] = results.map((row) => {
    const isHigh = row.national_percentile > 0.5;
    const percentileDisplay = isHigh
      ? Math.round(row.national_percentile * 100)
      : Math.round((1 - row.national_percentile) * 100);
    
    const direction: 'high' | 'low' = isHigh ? 'high' : 'low';
    const description = isHigh
      ? `${percentileDisplay}th percentile nationally (higher than ${percentileDisplay}% of areas)`
      : `${100 - percentileDisplay}th percentile nationally (lower than ${percentileDisplay}% of areas)`;

    return {
      table_id: row.table_id,
      title: row.title,
      label: row.label,
      estimate: row.estimate,
      national_percentile: row.national_percentile,
      direction,
      description,
    };
  });

  return {
    geo_id,
    name,
    facts,
  };
}


