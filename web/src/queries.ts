import { useQuery } from '@tanstack/react-query';
import type { EventDetailDTO, EventSummaryDTO, EventsQuery, Page, PlaceDTO } from '@illi-knows/shared';
import { useAuth } from './auth/context';
import { api, query } from './lib/api';

export function usePlaces() {
  return useQuery({
    queryKey: ['places'],
    queryFn: ({ signal }) => api<PlaceDTO[]>('/api/places', { signal }),
    staleTime: 60 * 60_000
  });
}

export function useEvents(params: EventsQuery) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['events', params, me?.id ?? null],
    queryFn: ({ signal }) => api<Page<EventSummaryDTO>>(`/api/events${query({ ...params })}`, { signal }),
    staleTime: 60_000
  });
}

export function useEvent(id: string | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['event', id, me?.id ?? null],
    queryFn: ({ signal }) => api<EventDetailDTO>(`/api/events/${id}`, { signal }),
    enabled: !!id,
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2
  });
}
