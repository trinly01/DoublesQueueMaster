// Round 3 — trinmar.boado dupr_connection + credentials + comparison players' connection rows.
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* vars may come from shell */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
const BASE = 'https://api.dinkmatch.club';
let reqCount = 0;
async function api(path) {
  reqCount++;
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: TOKEN } });
  const json = await res.json().catch(() => ({}));
  if (res.status >= 400) return { status: res.status, error: json };
  return { status: res.status, data: json?.data };
}
const show = (label, v) => console.log(`\n=== ${label} ===\n${JSON.stringify(v, null, 1)}`);

const TRIN = '0ad68234-236f-46d3-bc42-8b5cf35e8e73';
const CF = 'id,user,dupr_id,environment,status,singles_rating,doubles_rating,rating_updated_at,eligibility,eligibility_checked_at,connected_at,disconnected_at';

// 1) trinmar.boado connection row(s)
const c1 = await api(`/items/dupr_connection?filter[user][_eq]=${TRIN}&fields=${CF}`);
show(`dupr_connection trinmar.boado (status ${c1.status})`, c1.data ?? c1.error);
const trinConn = (c1.data || [])[0];
if (trinConn) {
  const cred = await api(`/items/dupr_credentials?filter[connection][_eq]=${trinConn.id}&fields=id,connection,access_expires_at,refresh_expires_at,created_at,updated_at`);
  show(`dupr_credentials trinmar conn ${trinConn.id} (status ${cred.status})`, cred.data ?? cred.error);
} else {
  const c2 = await api(`/items/dupr_connection?filter[dupr_id][_eq]=9D6NYR&fields=${CF}`);
  show(`dupr_connection by dupr_id=9D6NYR (status ${c2.status})`, c2.data ?? c2.error);
}

// 2) full user record attempt (item endpoint — maybe wider field set)
const uFull = await api(`/users/${TRIN}?fields=id,first_name,last_name,email,username,dupr_id,dupr_entitlements,dupr_singles_rating,dupr_doubles_rating,date_updated,status`);
show(`user ${TRIN} full (status ${uFull.status})`, uFull.data ?? uFull.error);

// 3) comparison: connection rows for users with eligible entitlements
//    Angelo Baribal 049d3771…, James Manganaan 15ff5edd…, Brian Balisacan 11608a45…
for (const [name, id] of [
  ['Angelo Baribal', '049d3771-5352-42c6-838e-d41e1a830c3c'],
  ['James Manganaan', '15ff5edd-242d-4ac7-bc48-988a62c3e749'],
]) {
  const c = await api(`/items/dupr_connection?filter[user][_eq]=${id}&fields=${CF}`);
  show(`dupr_connection ${name} (status ${c.status})`, c.data ?? c.error);
}

// 4) any dupr_connection rows with missing/ineligible eligibility (to see failure shape)?
const badElig = await api('/items/dupr_connection?filter[status][_eq]=connected&fields=id,user,dupr_id,status,eligibility,eligibility_checked_at&limit=50');
const rows = badElig.data || [];
const noL1 = rows.filter(r => !(r.eligibility?.entitlements?.tournaments || []).includes('BASIC_L1'));
show(`connected rows total=${rows.length}, missing BASIC_L1=${noL1.length} (status ${badElig.status})`, noL1.slice(0,10));

console.log(`\nTotal HTTP requests: ${reqCount}`);
