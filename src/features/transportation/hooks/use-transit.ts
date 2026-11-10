'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchTransitSnapshot } from '../services/transit-snapshot';

/**
 * Transit snapshot query. Like the city geometry, the snapshot is immutable
 * once generated, so it is cached indefinitely rather than revalidated.
 */
export function transitQueryKey(cityId: string) {
  return ['transit', cityId] as const;
}

export function useTransit(cityId: string) {
  return useQuery({
    queryKey: transitQueryKey(cityId),
    queryFn: () => fetchTransitSnapshot(cityId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}
