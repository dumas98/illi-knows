import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { REVIEW_TAB_LABELS, REVIEW_TABS, type EventSummaryDTO, type ReviewAction, type ReviewItemDTO, type ReviewTab, type SourceSummaryDTO } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { EventMapList } from '../components/EventMapList';
import { LoadState } from '../components/LoadState';
import { catClass, fmtDay, fmtDayNum, fmtMonth, fmtTime, timeAgo } from '../lib/format';
import { usePlaces, useReviewDecision, useReviewQueue, useSources } from '../queries';
import { useToast } from '../toast-context';
import { SignInToOrganize, StatusPill } from './Organize';

const DONE: Record<ReviewAction, string> = {
  approve: 'approved and published',
  request_changes: 'sent back for changes',
  reject: 'rejected',
  reopen: 'moved back to pending'
};

function SourceTile({ s, now }: { s: SourceSummaryDTO; now: number }) {
  const last = s.lastRunAt ? timeAgo(s.lastRunAt, now) : null;
  let text: string;
  if (s.kind === 'event_board') {
    text = `${s.syncEveryMinutes ? `Runs every ${s.syncEveryMinutes} minutes. ` : ''}${last ? `Last sync ${last}, ${s.newListings} new ${s.newListings === 1 ? 'listing' : 'listings'}.` : 'No sync yet.'}`;
  } else if (s.kind === 'instagram') {
    text = last ? `Sent by the extractor. Last import ${last}, ${s.newListings} new ${s.newListings === 1 ? 'listing' : 'listings'}.` : 'Sent by the extractor. No import yet.';
  } else {
    text = `Entered by hand from flyers and tips. ${s.pending} waiting for review.`;
  }
  return (
    <div className="tile stile">
      <div className="row between">
        <span className="lab strong">{s.label}</span>
        <span className={`pill ${s.mode === 'automatic' ? 's-published' : 's-draft'}`}>{s.mode === 'automatic' ? 'Automatic' : 'Manual'}</span>
      </div>
      <p className="small muted">{text}</p>
      {s.error && <p className="small note-bad">Last run: {s.error}</p>}
      {s.kind === 'word_of_mouth' && (
        <Link className="btn btn-sm" to="/review/tip">
          Add entry
        </Link>
      )}
    </div>
  );
}

function Flags({ item }: { item: ReviewItemDTO }) {
  if (!item.flags.length) return <span className="ok">No issues found</span>;
  return (
    <>
      {item.flags.map(f => (
        <span key={f.code + f.message} className="flag">
          Check: {f.message || f.code.replace(/_/g, ' ')}
          {f.relatedEvent && (
            <>
              {' '}
              (<Link to={`/events/${f.relatedEvent.id}`}>open it</Link>)
            </>
          )}
        </span>
      ))}
    </>
  );
}

function Decide({ item }: { item: ReviewItemDTO }) {
  const toast = useToast();
  const decision = useReviewDecision();
  const noteId = useId();
  const [asking, setAsking] = useState<'request_changes' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const run = (action: ReviewAction, withNote?: string) =>
    decision.mutate(
      { id: item.id, action, note: withNote || undefined },
      {
        onSuccess: () => {
          setAsking(null);
          setNote('');
          toast(
            `${item.title} ${DONE[action]}`,
            action === 'reopen' ? undefined : { label: 'Undo', onClick: () => decision.mutate({ id: item.id, action: 'reopen' }) }
          );
        },
        onError: err => setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    );

  if (item.status !== 'in_review') {
    return (
      <div className="qacts">
        <StatusPill event={item} />
        <button className="btn btn-sm" type="button" disabled={decision.isPending} onClick={() => run('reopen')}>
          Move back to pending
        </button>
      </div>
    );
  }

  if (asking) {
    const changes = asking === 'request_changes';
    return (
      <div className="qacts qnote">
        <label htmlFor={noteId} className="small strong">
          {changes ? 'What should they change?' : 'Reason (optional, shown to the organizer)'}
        </label>
        <textarea id={noteId} rows={2} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder={changes ? 'Add the room number' : 'Not a public event'} />
        {error && <span className="err">{error}</span>}
        <div className="row" style={{ gap: 6 }}>
          <button
            className={`btn btn-sm ${changes ? 'btn-primary' : 'btn-danger'}`}
            type="button"
            disabled={decision.isPending}
            onClick={() => {
              if (changes && !note.trim()) return setError('Tell the organizer what to change.');
              run(asking, note.trim());
            }}
          >
            {changes ? 'Send request' : 'Reject'}
          </button>
          <button className="btn btn-sm" type="button" onClick={() => (setAsking(null), setError(''))}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="qacts">
      <button className="btn btn-sm btn-primary" type="button" disabled={decision.isPending} onClick={() => run('approve')} aria-label={`Approve ${item.title}`}>
        Approve
      </button>
      <button className="btn btn-sm" type="button" onClick={() => setAsking('request_changes')} aria-label={`Request changes to ${item.title}`}>
        Request changes
      </button>
      <button className="btn btn-sm btn-danger" type="button" onClick={() => setAsking('reject')} aria-label={`Reject ${item.title}`}>
        Reject
      </button>
      {error && <span className="err">{error}</span>}
    </div>
  );
}

function QueueRow({ item }: { item: ReviewItemDTO }) {
  return (
    <article className={`qrow ${catClass(item.category)}`} aria-label={item.title}>
      <div className="qdate" aria-hidden="true">
        <b>{fmtMonth(item.startsAt)}</b>
        <span>{fmtDayNum(item.startsAt)}</span>
      </div>
      <div className="qbody">
        <div className="row" style={{ gap: 8 }}>
          <Link className="otitle" to={`/events/${item.id}`}>
            {item.title}
          </Link>
          <span className="catchip">{item.category}</span>
        </div>
        <span className="small muted">
          {fmtDay(item.startsAt)}, {fmtTime(item.startsAt)} · {item.locationText || 'No location'} · {item.from}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <Flags item={item} />
        </div>
        {(item.description || item.lastDecision?.note) && (
          <details className="qdetails">
            <summary>Details</summary>
            {item.description && <p className="small">{item.description}</p>}
            {item.lastDecision?.note && (
              <p className="small muted">
                Note from {item.lastDecision.by ?? 'a reviewer'}: {item.lastDecision.note}
              </p>
            )}
          </details>
        )}
      </div>
      <Decide item={item} />
    </article>
  );
}

export function Review() {
  const { status, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (REVIEW_TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as ReviewTab) : 'pending';
  const view = params.get('view') === 'map' ? 'map' : 'list';
  const queue = useReviewQueue(tab);
  const sources = useSources();
  const places = usePlaces();
  const [now] = useState(() => Date.now());

  if (status === 'loading') return <div className="skeleton">Loading…</div>;
  if (status !== 'signed-in') return <SignInToOrganize title="Review queue" />;
  if (!me?.roles.includes('admin')) {
    return (
      <section className="panel empty stack">
        <h1>Review queue</h1>
        <p className="muted">Only admins can review listings. Ask an existing admin to give your account access.</p>
      </section>
    );
  }

  const set = (k: string, v: string | null) =>
    setParams(p => {
      const next = new URLSearchParams(p);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    });
  const items = queue.data?.items ?? [];
  const counts = queue.data?.counts;
  const onMap = items.filter(i => i.place);
  const offMap = items.filter(i => !i.place);
  const byId = new Map(items.map(i => [i.id, i]));

  return (
    <>
      <section className="phero bleed">
        <p className="kicker">
          {me.name.split(' ')[0]} · Admin · {counts ? `${counts.pending} waiting` : ''}
        </p>
        <div className="stack" style={{ gap: 10 }}>
          <h1>
            Check it before it goes <span className="fly">live</span>
          </h1>
          <p className="lede on-dark">Every listing from event boards, Instagram, word of mouth, and organizers passes through here before anyone sees it.</p>
        </div>
        <div className="tiles stiles">
          {(sources.data ?? []).map(s => (
            <SourceTile key={s.kind} s={s} now={now} />
          ))}
        </div>
      </section>

      <section>
        <div className="row between">
          <div className="seg wrapseg" role="group" aria-label="Queue">
            {REVIEW_TABS.map(t => (
              <button key={t} type="button" aria-pressed={t === tab} onClick={() => set('tab', t === 'pending' ? null : t)}>
                {REVIEW_TAB_LABELS[t]}
                {counts && ` (${counts[t]})`}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === 'list'} onClick={() => set('view', null)}>
              List
            </button>
            <button type="button" aria-pressed={view === 'map'} onClick={() => set('view', 'map')}>
              Map
            </button>
          </div>
        </div>
        {tab === 'approved' && <p className="small muted">Approved in the last two weeks.</p>}
        <div className={queue.isPlaceholderData ? 'stale' : undefined} aria-busy={queue.isPlaceholderData}>
          <LoadState query={queue} empty={false} emptyText="">
            {items.length === 0 ? (
              <div className="panel empty stack">
                <h3>{tab === 'pending' ? 'Queue cleared' : 'Nothing in this list'}</h3>
                <p className="muted">{tab === 'pending' ? 'New listings land here after the next sync or import.' : 'Listings you move here show up in this list.'}</p>
              </div>
            ) : view === 'map' ? (
              <>
                {onMap.length > 0 && (
                  <EventMapList
                    events={onMap}
                    places={places.data ?? []}
                    hint="Pins show where each listing says it happens. Open one to review it."
                    foot={(e: EventSummaryDTO) => (
                      <>
                        <Flags item={byId.get(e.id)!} />
                        <span>{byId.get(e.id)!.from}</span>
                      </>
                    )}
                  />
                )}
                {offMap.length > 0 && (
                  <div className="stack" style={{ gap: 8 }}>
                    <h3>Not on the map ({offMap.length})</h3>
                    <div className="qlist">
                      {offMap.map(i => (
                        <QueueRow key={i.id} item={i} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="qlist">
                {items.map(i => (
                  <QueueRow key={i.id} item={i} />
                ))}
              </div>
            )}
          </LoadState>
        </div>
      </section>
    </>
  );
}
