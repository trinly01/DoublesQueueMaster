import { ref, watch } from 'vue';
import { LocalStorage } from 'quasar';
import { likhaClient, LIKHA_URL } from 'src/services/likhaClient';
import { readItems, createItem, updateItem, uploadFiles, readMe } from '@likha-erp/likha-sdk';
import { useNotify } from 'src/composables/useNotify';

// ---------- types (book_* collections — customer-facing subset) ----------
export interface BookTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  logo: string | null;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  contact_email: string | null;
  gcash_name: string | null;
  gcash_number: string | null;
  bank_details: string | null;
  payment_name: string | null;
  payment_qr: string | null;
  timezone: string;
  currency: string;
  slot_minutes: number;
  min_duration: number;
  max_duration: number;
  buffer_minutes: number;
  cancel_cutoff_hours: number;
  refund_policy: string | null;
  payment_timeout_minutes: number;
  auto_confirm_payments: boolean;
  allow_non_contiguous_slots: boolean;
}

export interface BookCourtPhoto {
  id: string;
  court: string;
  photo: string | null;   // directus_files id → fileUrl()
  caption: string | null;
  sort: number | null;
  seq?: number | null;
}

export interface BookCourt {
  id: string;
  tenant: string;
  name: string;
  sport: string | null;
  sport_name?: string;
  surface: string | null;
  description: string | null;
  photo: string | null;
  photos?: BookCourtPhoto[];
  price_per_hour: number;
  peak_multiplier: number | null;
  status: string;
  sort: number | null;
}

export interface BookOpeningHour {
  id: string;
  tenant: string;
  court: string | null;
  day_of_week: number; // 0=Sun..6=Sat (verify convention)
  open_time: string;   // 'HH:MM:SS'
  close_time: string;
  closed: boolean;
}

export interface BookClosure {
  id: string;
  tenant: string;
  court: string | null;
  date: string | null;
  date_start: string | null;
  date_end: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

export interface BookSlot {
  id: string;
  booking: string;
  court: string;
  date: string;        // 'YYYY-MM-DD'
  start_time: string;  // 'HH:MM:SS'
  end_time: string;
  duration_minutes: number | null;
  price: number | null;
  status: string;      // held | confirmed | cancelled
  held_until: string | null;
}

export interface BookBooking {
  id: string;
  ref: string | null;
  tenant: string;
  customer: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  status: string;
  payment_status: string;
  subtotal: number | null;
  total: number | null;
  notes: string | null;
  source: string;
  cancel_reason: string | null;
  slots?: BookSlot[];
  payments?: BookPayment[];
  proofs?: BookProof[];
}

export interface BookTenantBrief {
  id?: string;
  name?: string;
  gcash_name?: string | null;
  gcash_number?: string | null;
  bank_details?: string | null;
  payment_name?: string | null;
  payment_qr?: string | null;
  refund_policy?: string | null;
  payment_timeout_minutes?: number;
  [key: string]: unknown;
}

export interface BookBookingDetail extends Omit<BookBooking, 'tenant'> {
  tenant?: BookTenantBrief;
}

export interface BookPayment {
  id: string;
  booking: string;
  tenant: string;
  method: string | null;
  amount: number | null;
  status: string;
  reference: string | null;
  paid_at: string | null;
}

export interface BookProof {
  id: string;
  booking: string;
  payment: string | null;
  file: string | null;
  sender_name: string | null;
  reference_no: string | null;
  sent_at: string | null;
  status: string;
  rejection_reason: string | null;
}

// ---------- draft state (slot selection → checkout) ----------
export interface DraftSlot {
  court: string;
  courtName: string;
  date: string;
  start: string; // 'HH:MM'
  end: string;   // 'HH:MM'
  pricePerHour?: number; // estimate only — server recomputes
}

export const draftSlots = ref<DraftSlot[]>([]);
export const draftTenant = ref<BookTenant | null>(null);
export const pendingBookingId = ref<string | null>(null);

export function fileUrl(id: string | null | undefined): string {
  return id ? `${LIKHA_URL}/assets/${id}` : '';
}

/** Directus decimal fields come back as strings ("400.00000") — always Number() first */
export const peso = (n: number | string | null | undefined, decimals = 0): string =>
  (Number(n) || 0).toLocaleString('en-PH', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });

// ---------- helpers ----------
const hm = (t: string) => {
  const [h, m] = t.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};
export const toHM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type ReqOp = Parameters<typeof likhaClient.request>[0];
async function req<T>(op: ReqOp): Promise<T> {
  return (await likhaClient.request(op)) as T;
}

export interface VenueCard extends BookTenant {
  court_count: number;
  min_price: number | null;
}

// ---------- venue browsing ----------
export async function fetchVenues(): Promise<VenueCard[]> {
  const [rows, courts] = await Promise.all([
    req<unknown>(
      readItems('book_tenants', {
        fields: ['id', 'name', 'slug', 'logo', 'description', 'address',
          'contact_phone', 'gcash_name', 'slot_minutes', 'currency'],
        filter: { status: { _eq: 'active' } },
        sort: ['name'],
        limit: 100,
      }),
    ),
    req<unknown>(
      readItems('book_courts', {
        fields: ['id', 'tenant', 'price_per_hour'],
        filter: { status: { _eq: 'active' }, tenant: { status: { _eq: 'active' } } },
        limit: 500,
      }),
    ),
  ]);
  const byTenant = new Map<string, { count: number; min: number }>();
  for (const c of (Array.isArray(courts) ? courts : []) as { tenant: string; price_per_hour: string | number }[]) {
    const p = Number(c.price_per_hour) || 0;
    const cur = byTenant.get(c.tenant) ?? { count: 0, min: Infinity };
    cur.count += 1;
    cur.min = Math.min(cur.min, p);
    byTenant.set(c.tenant, cur);
  }
  return ((Array.isArray(rows) ? rows : []) as BookTenant[]).map((v) => ({
    ...v,
    court_count: byTenant.get(v.id)?.count ?? 0,
    min_price: byTenant.get(v.id)?.min === Infinity ? null : byTenant.get(v.id)?.min ?? null,
  }));
}

export async function fetchVenueBySlug(slug: string): Promise<BookTenant | null> {
  const rows = await req<unknown>(
    readItems('book_tenants', {
      // explicit whitelist — fields:['*'] 403s for guests (unpublished fields
      // like lat/lng/gcash_qr aren't readable by the public/customer roles)
      fields: ['id', 'name', 'slug', 'status', 'logo', 'description', 'address',
        'latitude', 'longitude', 'contact_phone', 'contact_email',
        'gcash_name', 'gcash_number', 'bank_details', 'payment_name', 'payment_qr',
        'timezone', 'currency',
        'slot_minutes', 'min_duration', 'max_duration', 'buffer_minutes',
        'cancel_cutoff_hours', 'auto_confirm_payments',
        'refund_policy', 'payment_timeout_minutes',
        'allow_non_contiguous_slots'],
      // suspended venues are returned so pages can show "temporarily
      // unavailable" instead of "not found"; pending stays hidden
      filter: { slug: { _eq: slug }, status: { _in: ['active', 'suspended'] } },
      limit: 1,
    }),
  );
  const list = Array.isArray(rows) ? rows : [];
  return (list[0] as BookTenant) ?? null;
}

export interface BookPaymentMethod {
  id: string;
  tenant: string;
  name: string;
  type: string;
  account_name: string | null;
  account_number: string | null;
  qr: string | null;
  instructions: string | null;
  sort: number | null;
}

export async function fetchPaymentMethods(tenantId: string): Promise<BookPaymentMethod[]> {
  const rows = await req<unknown>(
    readItems('book_payment_methods', {
      // matches public/customer whitelist — seq not readable by guests
      fields: ['id', 'tenant', 'name', 'type', 'account_name', 'account_number',
        'qr', 'instructions', 'sort'],
      filter: { tenant: { _eq: tenantId } },
      sort: ['sort', 'name'], limit: 50,
    }),
  );
  return (Array.isArray(rows) ? rows : []) as BookPaymentMethod[];
}

export async function fetchVenueBundle(slug: string) {
  const tenant = await fetchVenueBySlug(slug);
  if (!tenant) return null;
  const [courts, hours, closures, sports, courtPhotos, payMethods] = await Promise.all([
    req<unknown>(readItems('book_courts', {
      fields: ['id', 'tenant', 'name', 'sport', 'surface', 'description', 'photo',
        'price_per_hour', 'peak_multiplier', 'status', 'sort'],
      filter: { tenant: { _eq: tenant.id }, status: { _eq: 'active' } },
      sort: ['sort', 'name'], limit: 100,
    })),
    req<unknown>(readItems('book_opening_hours', {
      fields: ['id', 'tenant', 'court', 'day_of_week', 'open_time', 'close_time', 'closed'],
      filter: { tenant: { _eq: tenant.id } }, limit: 100,
    })),
    req<unknown>(readItems('book_closures', {
      fields: ['id', 'tenant', 'court', 'date', 'date_start', 'date_end', 'all_day',
        'start_time', 'end_time', 'reason'],
      filter: { tenant: { _eq: tenant.id } }, limit: 200,
    })),
    req<unknown>(readItems('book_sport_types', {
      fields: ['id', 'name', 'icon', 'sort'], limit: 100,
    })),
    req<unknown>(readItems('book_court_photos', {
      fields: ['id', 'court', 'photo', 'caption', 'sort', 'seq'],
      filter: { court: { tenant: { _eq: tenant.id }, status: { _eq: 'active' } } },
      sort: ['sort', 'seq'], limit: -1,
    })),
    fetchPaymentMethods(tenant.id),
  ]);
  const sportMap = new Map(
    ((Array.isArray(sports) ? sports : []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  );
  const courtRows = (Array.isArray(courts) ? courts : []) as BookCourt[];
  for (const c of courtRows) c.sport_name = c.sport != null ? sportMap.get(c.sport) : undefined;
  const byCourt = new Map<string, BookCourtPhoto[]>();
  for (const p of (Array.isArray(courtPhotos) ? courtPhotos : []) as BookCourtPhoto[]) {
    const list = byCourt.get(p.court) ?? [];
    list.push(p);
    byCourt.set(p.court, list);
  }
  for (const c of courtRows) c.photos = byCourt.get(c.id) ?? [];
  return {
    tenant,
    courts: courtRows,
    hours: (Array.isArray(hours) ? hours : []) as BookOpeningHour[],
    closures: (Array.isArray(closures) ? closures : []) as BookClosure[],
    paymentMethods: payMethods,
  };
}

// ---------- availability ----------
/** slots that block a court on a date: held(unexpired)/confirmed, not cancelled */
export async function fetchDaySlots(courtIds: string[], date: string): Promise<BookSlot[]> {
  if (!courtIds.length) return [];
  const rows = await req<unknown>(
    readItems('book_booking_slots', {
      fields: ['id', 'booking', 'court', 'date', 'start_time', 'end_time',
        'duration_minutes', 'price', 'status', 'held_until'],
      filter: {
        court: { _in: courtIds },
        date: { _eq: date },
        status: { _in: ['held', 'confirmed'] },
      },
      limit: -1,
    }),
  );
  const now = Date.now();
  return ((Array.isArray(rows) ? rows : []) as BookSlot[]).filter((s) => {
    if (s.status === 'confirmed') return true;
    // held only blocks until held_until
    return !!s.held_until && new Date(s.held_until).getTime() > now;
  });
}

/** does a closure block this court/date/time? */
export function closureBlocks(
  closures: BookClosure[], courtId: string, date: string,
  startMin: number, endMin: number,
): boolean {
  return closures.some((cl) => {
    if (cl.court != null && cl.court !== courtId) return false;
    const ds = cl.date_start ?? cl.date;
    const de = cl.date_end ?? cl.date;
    if (!ds || date < ds || (de && date > de)) return false;
    if (cl.all_day) return true;
    if (cl.start_time == null && cl.end_time == null) return true;
    const cs = cl.start_time ? hm(cl.start_time) : 0;
    const ce = cl.end_time ? hm(cl.end_time) : 24 * 60;
    return cs < endMin && ce > startMin;
  });
}

/** court operating window for a weekday: court-specific row wins, else tenant-wide (court=null) */
export function hoursFor(
  hours: BookOpeningHour[], courtId: string, dayOfWeek: number,
): { open: number; close: number } | null {
  const forCourt = hours.find((h) => h.court === courtId && h.day_of_week === dayOfWeek);
  const forAll = hours.find((h) => h.court == null && h.day_of_week === dayOfWeek);
  const h = forCourt ?? forAll;
  if (!h || h.closed) return null;
  return { open: hm(h.open_time), close: hm(h.close_time) };
}

// ---------- draft ----------
export function setDraft(tenant: BookTenant, slots: DraftSlot[]) {
  draftTenant.value = tenant;
  draftSlots.value = slots;
}
export function clearDraft() {
  draftSlots.value = [];
  draftTenant.value = null;
  pendingBookingId.value = null;
}

// ---------- draft persistence ----------
// Survives full reloads and the login redirect (guest picks slots → /login → back).
// Checkout re-validates availability server-side, so stale entries fail safe.
const DRAFT_KEY = 'book-draft';
const PENDING_KEY = 'book-pending';

interface StoredDraft { tenant: BookTenant | null; slots: DraftSlot[]; savedAt: number }

function persistDraft() {
  try {
    if (!draftSlots.value.length) {
      LocalStorage.remove(DRAFT_KEY);
      return;
    }
    LocalStorage.set(DRAFT_KEY, {
      tenant: draftTenant.value, slots: draftSlots.value, savedAt: Date.now(),
    } satisfies StoredDraft);
  } catch { /* storage unavailable — draft stays in memory */ }
}

watch(draftSlots, persistDraft, { deep: true });
watch(draftTenant, persistDraft, { deep: true });
watch(pendingBookingId, (id) => {
  try {
    if (id) LocalStorage.set(PENDING_KEY, id); else LocalStorage.remove(PENDING_KEY);
  } catch { /* noop */ }
});

// hydrate once at module load — drop slots whose date already passed or draft too old
const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000; // selection only — holds start at booking create
try {
  const stored = LocalStorage.getItem<StoredDraft>(DRAFT_KEY);
  if (stored?.slots?.length) {
    const today = todayStr();
    const fresh = stored.slots.filter((s) => s.date >= today);
    const stale = !stored.savedAt || Date.now() - stored.savedAt > DRAFT_MAX_AGE;
    if (fresh.length && stored.tenant && !stale) {
      draftTenant.value = stored.tenant;
      draftSlots.value = fresh;
    } else {
      LocalStorage.remove(DRAFT_KEY);
    }
  }
  const pend = LocalStorage.getItem<string>(PENDING_KEY);
  if (pend) pendingBookingId.value = pend;
} catch { /* noop */ }

// ---------- booking create (nested slots → holds) ----------
export async function createBooking(payload: {
  tenantId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  slots: { court: string; date: string; start: string; end: string }[];
}): Promise<BookBooking> {
  const body = {
    tenant: payload.tenantId,
    customer_name: payload.customerName,
    customer_phone: payload.customerPhone || null,
    customer_email: payload.customerEmail || null,
    notes: payload.notes || null,
    slots: payload.slots.map((s) => ({
      court: s.court,
      date: s.date,
      start_time: `${s.start}:00`,
      end_time: `${s.end}:00`,
    })),
  };
  const created = await req<unknown>(createItem('book_bookings', body));
  return created as BookBooking;
}

// ---------- payment + proof ----------
/** Display label for the venue's pay method — payment_name wins, else GCash if an
 *  account is set, else a generic fallback. Venues can take any bank/wallet. */
export function tenantPayLabel(t?: { payment_name?: string | null; gcash_name?: string | null; gcash_number?: string | null } | null): string {
  return t?.payment_name?.trim()
    || (t?.gcash_name || t?.gcash_number ? 'GCash' : 'Payment details');
}

function methodForTenant(t?: { payment_name?: string | null; payment_qr?: string | null } | null): string {
  const n = (t?.payment_name ?? '').toLowerCase();
  if (n.includes('gcash')) return 'gcash';
  if (n.includes('maya')) return 'maya';
  if (/bank|bpi|union ?bank|metro ?bank|maribank|landbank|pnb|rcbc|bdo|chinabank|security bank|gotyme|seabank|tonik|ing|cimb/.test(n)) return 'bank';
  if (t?.payment_qr) return 'qrph';
  return 'other';
}

export async function ensurePayment(
  bookingId: string, amount: number,
  tenant?: { payment_name?: string | null; payment_qr?: string | null } | null,
): Promise<BookPayment> {
  const existing = await req<unknown>(
    readItems('book_payments', {
      fields: ['id', 'booking', 'method', 'amount', 'status', 'reference', 'paid_at'],
      filter: { booking: { _eq: bookingId } },
      // -paid_at: whitelisted + puts settled payments first; date_created isn't readable
      sort: ['-paid_at'], limit: 1,
    }),
  );
  const list = Array.isArray(existing) ? existing : [];
  if (list.length) return list[0] as BookPayment;
  const created = await req<unknown>(
    createItem('book_payments', { booking: bookingId, method: methodForTenant(tenant), amount }),
  );
  return created as BookPayment;
}

export async function bookingTotal(bookingId: string): Promise<number> {
  // totals are computed async by flow — poll briefly
  for (let i = 0; i < 10; i++) {
    const b = await req<unknown>(
      readItems('book_bookings', {
        fields: ['id', 'total', 'subtotal', 'ref'],
        filter: { id: { _eq: bookingId } }, limit: 1,
      }),
    );
    const row = (Array.isArray(b) ? b : [])[0] as BookBooking | undefined;
    if (row?.total != null && row.total > 0) return row.total;
    await new Promise((r) => setTimeout(r, 600));
  }
  return 0;
}

export async function submitProof(payload: {
  bookingId: string;
  paymentId: string;
  file: File;
  senderName: string;
  referenceNo?: string;
}): Promise<void> {
  const formData = new FormData();
  formData.append('file', payload.file);
  const uploaded = await req<unknown>(uploadFiles(formData));
  const fileRow = (Array.isArray(uploaded) ? uploaded[0] : uploaded) as { id: string };
  if (!fileRow?.id) throw new Error('proof upload failed');
  await req<unknown>(
    createItem('book_payment_proofs', {
      booking: payload.bookingId,
      payment: payload.paymentId,
      file: fileRow.id,
      sender_name: payload.senderName,
      reference_no: payload.referenceNo || null,
      sent_at: new Date().toISOString(),
    }),
  );
}

// ---------- my bookings ----------
export async function fetchMyBookings(): Promise<BookBooking[]> {
  const rows = await req<unknown>(
    readItems('book_bookings', {
      fields: ['id', 'ref', 'tenant', 'customer_name', 'status', 'payment_status',
        'subtotal', 'total', 'source', 'cancel_reason', 'slots',
        'slots.court', 'slots.date', 'slots.start_time', 'slots.end_time',
        'slots.status', 'slots.price', 'tenant.name',
        'payments.id', 'payments.status', 'payments.amount'],
      sort: ['-seq'], limit: 100,
    }),
  );
  return (Array.isArray(rows) ? rows : []) as BookBooking[];
}

export async function fetchBooking(id: string): Promise<BookBookingDetail | null> {
  const rows = await req<unknown>(
    readItems('book_bookings', {
      // explicit fields — '*' requests unreadable columns (internal_notes,
      // platform_fee, system fields…) and the whole query 403s for customers
      fields: [
        'id', 'ref', 'tenant', 'customer_name', 'customer_phone', 'customer_email',
        'status', 'payment_status', 'subtotal', 'total', 'notes', 'source',
        'checked_in_at', 'cancelled_at', 'cancel_reason',
        'slots.id', 'slots.court', 'slots.date',
        'slots.start_time', 'slots.end_time', 'slots.duration_minutes',
        'slots.price', 'slots.status', 'slots.held_until',
        'payments.id', 'payments.method', 'payments.amount', 'payments.status',
        'payments.reference', 'payments.paid_at', 'payments.receipt_file',
        'proofs.id', 'proofs.file', 'proofs.sender_name', 'proofs.reference_no',
        'proofs.sent_at', 'proofs.status', 'proofs.rejection_reason',
        'proofs.reviewed_at',
        'tenant.id', 'tenant.name', 'tenant.slug', 'tenant.gcash_name', 'tenant.gcash_number',
        'tenant.bank_details', 'tenant.payment_name', 'tenant.payment_qr',
        'tenant.refund_policy', 'tenant.payment_timeout_minutes',
      ],
      filter: { id: { _eq: id } }, limit: 1,
    }),
  );
  const list = Array.isArray(rows) ? rows : [];
  return (list[0] as BookBookingDetail) ?? null;
}

export async function cancelBooking(id: string, reason?: string): Promise<void> {
  await req<unknown>(
    updateItem('book_bookings', id, { status: 'cancelled', cancel_reason: reason || null }),
  );
}

// ---------- profile prefill ----------
export async function fetchMyProfile(): Promise<{ name: string; email: string }> {
  try {
    const me = (await req<unknown>(readMe({ fields: ['first_name', 'last_name', 'email'] }))) as {
      first_name?: string; last_name?: string; email?: string;
    };
    return {
      name: [me.first_name, me.last_name].filter(Boolean).join(' ').trim(),
      email: me.email ?? '',
    };
  } catch {
    return { name: '', email: '' };
  }
}

export function useBooking() {
  const { notify } = useNotify();
  return {
    draftSlots, draftTenant, pendingBookingId,
    setDraft, clearDraft,
    fetchVenues, fetchVenueBySlug, fetchVenueBundle,
    fetchDaySlots, closureBlocks, hoursFor,
    createBooking, ensurePayment, bookingTotal, submitProof,
    fetchMyBookings, fetchBooking, cancelBooking, fetchMyProfile,
    fileUrl, toHM, todayStr, hm,
    notify,
  };
}
