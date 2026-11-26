import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttendeesDTO, CampusBasemap, EventDetailDTO, EventSummaryDTO, EventsQuery, Page, PlaceDTO, PlannerDTO, RsvpUpdate } from '@illi-knows/shared';
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

/** Paged list for "Show more". */
export function useEventPages(params: EventsQuery, enabled = true) {
  const { me } = useAuth();
  return useInfiniteQuery({
    queryKey: ['events', 'pages', params, me?.id ?? null],
    queryFn: ({ signal, pageParam }) =>
      api<Page<EventSummaryDTO>>(`/api/events${query({ ...params, cursor: pageParam ?? undefined })}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.nextCursor,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled
  });
}

const ALL_EVENTS_CAP = 500;

/** Every matching event, following the cursor (for the map and the week grid). */
export function useAllEvents(params: EventsQuery, enabled = true) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['events', 'all', params, me?.id ?? null],
    queryFn: async ({ signal }) => {
      const items: EventSummaryDTO[] = [];
      let cursor: string | null = null;
      do {
        const page: Page<EventSummaryDTO> = await api<Page<EventSummaryDTO>>(
          `/api/events${query({ ...params, limit: 100, cursor: cursor ?? undefined })}`,
          { signal }
        );
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && items.length < ALL_EVENTS_CAP);
      return { items, truncated: !!cursor };
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled
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

export function useBasemap() {
  return useQuery({
    queryKey: ['basemap'],
    queryFn: async ({ signal }) => {
      const res = await fetch('/map/campus-basemap.json', { signal });
      if (!res.ok) throw new Error('Could not load the campus map.');
      return (await res.json()) as CampusBasemap;
    },
    staleTime: Infinity
  });
}

export function useAttendees(id: string | undefined) {
  return useQuery({
    queryKey: ['attendees', id],
    queryFn: ({ signal }) => api<AttendeesDTO>(`/api/events/${id}/attendees?limit=12`, { signal }),
    enabled: !!id
  });
}

export function usePlanner() {
  const { me, status } = useAuth();
  return useQuery({
    queryKey: ['planner', me?.id ?? null],
    queryFn: ({ signal }) => api<PlannerDTO>('/api/me/planner', { signal }),
    enabled: status === 'signed-in'
  });
}

export function useRsvp(id: string) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const done = (detail: EventDetailDTO) => {
    qc.setQueryData(['event', id, me?.id ?? null], detail);
    void qc.invalidateQueries({ queryKey: ['events'] });
    void qc.invalidateQueries({ queryKey: ['planner'] });
    void qc.invalidateQueries({ queryKey: ['attendees', id] });
  };
  const update = useMutation({
    mutationFn: (change: RsvpUpdate) => api<EventDetailDTO>(`/api/events/${id}/rsvp`, { method: 'PUT', body: change }),
    onSuccess: done
  });
  const cancel = useMutation({
    mutationFn: () => api<EventDetailDTO>(`/api/events/${id}/rsvp`, { method: 'DELETE' }),
    onSuccess: done
  });
  return { update, cancel };
}
