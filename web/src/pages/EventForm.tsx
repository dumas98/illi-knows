import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, type Category, type EventInput, type OrganizerEventDTO, type PlaceDTO, type TipInput } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { ApiError } from '../lib/api';
import { addDaysKey, campusMinutes, dayKey } from '../lib/format';
import { useAddTip, useOrganizerEvent, usePlaces, useSaveEvent } from '../queries';
import { useToast } from '../toast-context';
import { usePageTitle } from '../lib/usePageTitle';
import { SignInToOrganize, StatusPill } from './Organize';

interface FormState {
  title: string;
  description: string;
  category: Category;
  date: string;
  startTime: string;
  endTime: string;
  placeName: string;
  offMap: boolean;
  locationDetail: string;
  locationText: string;
  organizationId: string;
  hostName: string;
  isFree: boolean;
  price: string;
  priceNote: string;
}

type Errors = Partial<Record<keyof EventInput | 'hostName' | 'form', string>>;

const hhmm = (iso: string) => {
  const m = campusMinutes(iso);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function initialState(e: OrganizerEventDTO | undefined, defaultOrg: string, today: string): FormState {
  if (!e) {
    return {
      title: '',
      description: '',
      category: 'Music',
      date: addDaysKey(today, 7),
      startTime: '19:00',
      endTime: '21:00',
      placeName: '',
      offMap: false,
      locationDetail: '',
      locationText: '',
      organizationId: defaultOrg,
      hostName: '',
      isFree: true,
      price: '',
      priceNote: ''
    };
  }
  return {
    title: e.title,
    description: e.description,
    category: e.category,
    date: dayKey(e.startsAt),
    startTime: hhmm(e.startsAt),
    endTime: hhmm(e.endsAt),
    placeName: e.place?.name ?? '',
    offMap: !e.place && !!e.locationText,
    locationDetail: e.place ? (e.locationDetail ?? '') : '',
    locationText: e.place ? '' : e.locationText,
    organizationId: e.host.organizationId ?? '',
    hostName: e.host.name,
    isFree: e.price.isFree,
    price: e.price.amountCents ? String(e.price.amountCents / 100) : '',
    priceNote: e.price.note ?? ''
  };
}

function findPlace(places: PlaceDTO[], name: string): PlaceDTO | undefined {
  const n = name.trim().toLowerCase();
  return places.find(p => p.name.toLowerCase() === n);
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <span className="small muted" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="err" id={`${id}-err`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** `tip` is the admin's word-of-mouth form: a typed host name, and it goes straight to the review queue. */
function FormBody({ event, today, mode = 'event' }: { event?: OrganizerEventDTO; today: string; mode?: 'event' | 'tip' }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const places = usePlaces();
  const save = useSaveEvent(event?.id);
  const addTip = useAddTip();
  const tip = mode === 'tip';
  const pending = save.isPending || addTip.isPending;
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const [f, setF] = useState<FormState>(() => initialState(event, me?.organizations[0]?.id ?? '', today));
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(prev => ({ ...prev, [k]: v }));

  const live = event?.status === 'published';
  const waiting = event?.status === 'in_review';
  const canDraft = !tip && (!event || event.status === 'draft' || event.status === 'changes_requested');
  const describedBy = (name: string, hint = false) => (errors[name as keyof Errors] ? `${id(name)}-err` : hint ? `${id(name)}-hint` : undefined);

  const submit = (sendForReview: boolean) => (ev?: FormEvent) => {
    ev?.preventDefault();
    const local: Errors = {};
    if (!f.title.trim()) local.title = 'Enter an event name.';
    if (tip && !f.hostName.trim()) local.hostName = 'Enter who is hosting it.';
    if (!f.date) local.date = 'Pick a date.';
    const place = f.offMap ? undefined : findPlace(places.data ?? [], f.placeName);
    if (!f.offMap && f.placeName.trim() && !place) local.placeKey = 'Pick a place from the list, or tick "Not on the campus map".';
    if (!f.isFree && !(Number(f.price) > 0)) local.priceDollars = 'Enter a price, or mark the event as free.';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const input: EventInput = {
      title: f.title,
      description: f.description,
      category: f.category,
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      placeKey: place?.key ?? null,
      locationDetail: place ? f.locationDetail : '',
      locationText: f.offMap ? f.locationText : '',
      organizationId: f.organizationId || null,
      isFree: f.isFree,
      priceDollars: f.isFree ? null : Number(f.price),
      priceNote: f.isFree ? '' : f.priceNote,
      submit: sendForReview
    };
    setErrors({});
    const onError = (err: Error) => {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, v[0]])) as Errors);
      } else setErrors({ form: err.message || 'Something went wrong. Try again.' });
    };
    if (tip) {
      const { organizationId: _org, submit: _submit, ...rest } = input;
      const tipInput: TipInput = { ...rest, hostName: f.hostName };
      addTip.mutate(tipInput, {
        onSuccess: saved => {
          toast(`${saved.title} added to the review queue`);
          navigate('/review');
        },
        onError
      });
      return;
    }
    save.mutate(input, {
      onSuccess: saved => {
        toast(saved.status === 'in_review' ? `${saved.title} sent for review` : `${saved.title} saved as a draft`);
        navigate('/organize');
      },
      onError
    });
  };

  return (
    <form className="panel eform" noValidate onSubmit={submit(true)}>
      {event && (
        <p className="row" style={{ gap: 8 }}>
          <span className="small muted">Status</span> <StatusPill event={event} />
        </p>
      )}
      {event?.reviewNote && (
        <div className="notice notice-bad" role="note">
          <strong>Reviewer note:</strong> {event.reviewNote}
        </div>
      )}
      {(live || waiting) && (
        <div className="notice" role="note">
          {live
            ? 'This event is live. Saving sends it back to review, and it stays hidden until a reviewer approves it again. RSVPs and reminders are kept.'
            : 'This event is waiting for review. Saving keeps it in the queue with your changes.'}
        </div>
      )}

      <Field id={id('title')} label="Event name" error={errors.title}>
        <input
          id={id('title')}
          type="text"
          value={f.title}
          maxLength={120}
          placeholder="Vinyl swap meet"
          aria-invalid={!!errors.title}
          aria-describedby={describedBy('title')}
          onChange={e => set('title', e.target.value)}
        />
      </Field>

      <div className="two">
        {tip ? (
          <Field id={id('host')} label="Hosted by" error={errors.hostName}>
            <input
              id={id('host')}
              type="text"
              value={f.hostName}
              maxLength={100}
              placeholder="Lantern Society"
              aria-invalid={!!errors.hostName}
              aria-describedby={describedBy('hostName')}
              onChange={e => set('hostName', e.target.value)}
            />
          </Field>
        ) : (
          <Field id={id('host')} label="Hosted by" error={errors.organizationId}>
            <select id={id('host')} value={f.organizationId} onChange={e => set('organizationId', e.target.value)}>
              {me?.organizations.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              <option value="">{me?.name ?? 'Me'} (just me)</option>
            </select>
          </Field>
        )}
        <Field id={id('category')} label="Category" error={errors.category}>
          <select id={id('category')} value={f.category} onChange={e => set('category', e.target.value as Category)}>
            {CATEGORIES.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="three">
        <Field id={id('date')} label="Date" error={errors.date}>
          <input
            id={id('date')}
            type="date"
            value={f.date}
            min={today}
            aria-invalid={!!errors.date}
            aria-describedby={describedBy('date')}
            onChange={e => set('date', e.target.value)}
          />
        </Field>
        <Field id={id('start')} label="Starts" error={errors.startTime}>
          <input id={id('start')} type="time" value={f.startTime} step={300} onChange={e => set('startTime', e.target.value)} />
        </Field>
        <Field id={id('end')} label="Ends" error={errors.endTime} hint={f.endTime && f.endTime < f.startTime ? 'Ends the next day' : undefined}>
          <input
            id={id('end')}
            type="time"
            value={f.endTime}
            step={300}
            aria-invalid={!!errors.endTime}
            aria-describedby={describedBy('endTime', true)}
            onChange={e => set('endTime', e.target.value)}
          />
        </Field>
      </div>

      {f.offMap ? (
        <Field id={id('loctext')} label="Location" error={errors.locationText} hint="Shown as written. The event won't have a pin on the map.">
          <input
            id={id('loctext')}
            type="text"
            value={f.locationText}
            maxLength={200}
            placeholder="Green Street co-op, basement"
            aria-describedby={describedBy('locationText', true)}
            onChange={e => set('locationText', e.target.value)}
          />
        </Field>
      ) : (
        <div className="two">
          <Field id={id('place')} label="Campus place" error={errors.placeKey} hint="Start typing a building, hall, or quad.">
            <input
              id={id('place')}
              type="text"
              list={id('places')}
              value={f.placeName}
              placeholder="Illini Union"
              autoComplete="off"
              aria-invalid={!!errors.placeKey}
              aria-describedby={describedBy('placeKey', true)}
              onChange={e => set('placeName', e.target.value)}
            />
            <datalist id={id('places')}>
              {(places.data ?? []).map(p => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </Field>
          <Field id={id('detail')} label="Room or spot (optional)" error={errors.locationDetail}>
            <input id={id('detail')} type="text" value={f.locationDetail} maxLength={120} placeholder="Room 210" onChange={e => set('locationDetail', e.target.value)} />
          </Field>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={f.offMap} onChange={e => set('offMap', e.target.checked)} /> Not on the campus map
      </label>

      <Field id={id('desc')} label="Description" error={errors.description}>
        <textarea
          id={id('desc')}
          value={f.description}
          maxLength={5000}
          rows={5}
          placeholder="What should people expect?"
          onChange={e => set('description', e.target.value)}
        />
      </Field>

      <label className="check">
        <input type="checkbox" checked={f.isFree} onChange={e => set('isFree', e.target.checked)} /> Free to attend
      </label>
      {!f.isFree && (
        <div className="two">
          <Field id={id('price')} label="Price in dollars" error={errors.priceDollars}>
            <input
              id={id('price')}
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={f.price}
              aria-invalid={!!errors.priceDollars}
              aria-describedby={describedBy('priceDollars')}
              onChange={e => set('price', e.target.value)}
            />
          </Field>
          <Field id={id('pnote')} label="Price note (optional)" error={errors.priceNote}>
            <input id={id('pnote')} type="text" value={f.priceNote} maxLength={80} placeholder="Pay at the door" onChange={e => set('priceNote', e.target.value)} />
          </Field>
        </div>
      )}

      <p className="small muted">
        {tip
          ? 'The tip goes into the pending queue like any other listing. Approve it there to publish it.'
          : 'New and edited events go to the review queue before anyone else can see them.'}
      </p>
      {errors.form && (
        <p className="err" role="alert">
          {errors.form}
        </p>
      )}
      <div className="row formactions">
        <Link className="btn" to={tip ? '/review' : '/organize'}>
          Cancel
        </Link>
        {canDraft && (
          <button className="btn" type="button" disabled={pending} onClick={submit(false)}>
            Save draft
          </button>
        )}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : tip ? 'Add to review queue' : 'Send for review'}
        </button>
      </div>
    </form>
  );
}

export function EventForm() {
  const { id } = useParams();
  usePageTitle(id ? 'Edit event' : 'Create event');
  const { status } = useAuth();
  const existing = useOrganizerEvent(id);
  const [today] = useState(() => dayKey(new Date()));

  if (status === 'loading') return <div className="skeleton">Loading…</div>;
  if (status !== 'signed-in') return <SignInToOrganize title={id ? 'Edit event' : 'Create event'} />;

  let body: ReactNode;
  if (!id) body = <FormBody today={today} />;
  else if (existing.isPending) body = <div className="skeleton">Loading…</div>;
  else if (existing.isError || !existing.data) {
    body = (
      <div className="panel empty stack" role="alert">
        <h2>We couldn&apos;t find that event</h2>
        <p className="muted">It may have been deleted, or it belongs to an organization you aren&apos;t part of.</p>
        <Link className="btn btn-primary" to="/organize">
          Back to your events
        </Link>
      </div>
    );
  } else if (!existing.data.editable) {
    body = (
      <div className="panel empty stack">
        <h2>This event can&apos;t be edited</h2>
        <p className="muted">{existing.data.ended ? 'It has already ended.' : `It was ${existing.data.status}.`}</p>
        <Link className="btn btn-primary" to="/organize">
          Back to your events
        </Link>
      </div>
    );
  } else body = <FormBody key={existing.data.id} event={existing.data} today={today} />;

  return (
    <section className="narrow">
      <Link to="/organize">Back to your events</Link>
      <h1>{id ? 'Edit event' : 'Create event'}</h1>
      {body}
    </section>
  );
}

export function TipForm() {
  usePageTitle('Add a word-of-mouth tip');
  const { status, me } = useAuth();
  const [today] = useState(() => dayKey(new Date()));
  if (status === 'loading') return <div className="skeleton">Loading…</div>;
  if (status !== 'signed-in') return <SignInToOrganize title="Add a word-of-mouth tip" text="Sign in with an admin account to add tips to the review queue." />;
  return (
    <section className="narrow">
      <Link to="/review">Back to the review queue</Link>
      <h1>Add a word-of-mouth tip</h1>
      <p className="muted">For events you heard about from a flyer, a group chat, or a friend.</p>
      {me?.roles.includes('admin') ? (
        <FormBody today={today} mode="tip" />
      ) : (
        <div className="panel empty stack">
          <h2>Admins only</h2>
          <p className="muted">Ask an admin to add it, or post it yourself as an organizer.</p>
        </div>
      )}
    </section>
  );
}
