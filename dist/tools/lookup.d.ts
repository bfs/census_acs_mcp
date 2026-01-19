import type { LookupLocationResult, ResolvedLocation, SearchLocationsResult, ListGeographiesResult } from '../types.js';
/**
 * Search for locations matching a query string
 * Returns a list of matches with their summary levels
 */
export declare function searchLocations(searchQuery: string, summaryLevel?: string, limit?: number): Promise<SearchLocationsResult>;
/**
 * List geographies by summary level
 * Optionally filter to children of a parent geography
 */
export declare function listGeographies(summaryLevel: string, parentGeoId?: string, limit?: number): Promise<ListGeographiesResult>;
/**
 * Resolve a location string to a geo_id
 * Handles: ZIP codes, county names, geo_ids
 *
 * @param input - Location string (name, ZIP, or geo_id)
 * @param summaryLevel - Optional filter by summary level (e.g., "040" or "state")
 */
export declare function resolveLocation(input: string, summaryLevel?: string): Promise<ResolvedLocation | null>;
/**
 * Get the summary level code from a geo_id
 */
export declare function getSummaryLevel(geoId: string): string;
/**
 * Lookup census data by lat/lng coordinates
 */
export declare function lookupLocation(latitude: number, longitude: number, tables?: string[]): Promise<LookupLocationResult | null>;
