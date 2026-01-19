export interface GeoLocation {
  geo_id: string;
  name: string;
  summary_level?: string;
}

export interface TableData {
  table_id: string;
  title: string;
  universe: string;
  labels_data: Record<string, unknown>;
}

export interface LookupLocationResult {
  geo_id: string;
  name: string;
  summary_level: string;
  data: TableData[];
}

export interface RankResult {
  geo_id: string;
  name: string;
  value: number;
  unit: 'count' | 'percent';
  national_percentile?: number;
}

export interface RankAreasResult {
  metric: string;
  results: RankResult[];
  total_matches: number;
}

export interface AreaSummaryResult {
  geo_id: string;
  name: string;
  summary_level: string;
  land_area_sq_miles: number;
  tables: TableData[];
}

export interface ComparisonMetric {
  metric_id: string;
  label: string;
  value_a: number;
  value_b: number;
  percentile_a: number;
  percentile_b: number;
}

export interface CompareAreasResult {
  area_a: GeoLocation;
  area_b: GeoLocation;
  comparisons: ComparisonMetric[];
}

export interface Topic {
  name: string;
  description: string;
  table_count: number;
  example_tables: string[];
}

export interface ListTopicsResult {
  topics: Topic[];
}

export interface SearchResult {
  table_id: string;
  title: string;
  universe: string;
  matching_labels: string[];
}

export interface SearchDataResult {
  query: string;
  results: SearchResult[];
  total_matches: number;
}

export interface TableLabel {
  unique_id: string;
  line: number;
  label: string;
}

export interface DescribeTableResult {
  table_id: string;
  title: string;
  universe: string;
  labels: TableLabel[];
}

export interface InterestingFact {
  table_id: string;
  title: string;
  label: string;
  estimate: number;
  national_percentile: number;
  direction: 'high' | 'low';
  description: string;
}

export interface InterestingFactsResult {
  geo_id: string;
  name: string;
  facts: InterestingFact[];
}

export interface ResolvedLocation {
  geo_id: string;
  name: string;
}

// Summary level codes
export const SUMMARY_LEVELS: Record<string, string> = {
  '040': 'state',
  '050': 'county',
  '140': 'tract',
  '150': 'block_group',
  '310': 'metro',
  '860': 'zip',
};

export const SUMMARY_LEVEL_NAMES: Record<string, string> = {
  state: '040',
  county: '050',
  tract: '140',
  block_group: '150',
  metro: '310',
  zip: '860',
};

export interface SearchLocationsResult {
  query: string;
  results: {
    geo_id: string;
    name: string;
    summary_level: string;
    summary_level_name: string;
  }[];
  total_matches: number;
}

export interface ListGeographiesResult {
  summary_level: string;
  summary_level_name: string;
  parent_geo_id?: string;
  results: {
    geo_id: string;
    name: string;
  }[];
  total_count: number;
}

export interface PopulationGroup {
  code: string;
  name: string;
  record_count: number;
}

export interface ListPopulationGroupsResult {
  groups: PopulationGroup[];
}

export interface UniverseInfo {
  universe: string;
  table_count: number;
  example_tables: string[];
}

export interface ListUniversesResult {
  universes: UniverseInfo[];
  total_count: number;
}


