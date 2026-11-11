/**
 * Tenant (venue) ECharts panels — Apache ECharts via likha-echarts-panel.
 *
 * Each chart = one webhook flow: likha_sql gathers tenant-scoped rows, exec
 * builds a plain ECharts option object (no functions — the panel clones it).
 * The panel calls GET /flows/trigger/{id} through useApi(), so the VIEWER's
 * token is forwarded and {{$accountability.user}}/{{accountability.admin}}
 * resolve to the person looking at the dashboard.
 *
 * Tenant isolation is enforced inside the SQL (likha_sql bypasses ACL):
 *   - admins see all venues
 *   - staff see rows for tenants in book_tenant_users ∪ book_tenant_ids ∪
 *     book_tenant on their user record
 *
 * Panels use options.url (not options.flow) so Studio never GETs
 * /flows/{id} — tenant roles need no directus_flows read permission.
 *
 * Idempotent: flows/ops/panels matched by name/key → PATCH else POST.
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const DASH_ID = '31922276-1767-4e00-b4a7-4c46de4bc755';

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json?.errors?.[0] || json).slice(0, 300)}`);
  return json?.data ?? json;
}

const getId = async (endpoint, filter) => {
  const rows = await api('GET', `/${endpoint}?limit=1&${filter}&fields=id`);
  return rows?.[0]?.id ?? null;
};

// Row-level tenant scope for queries that join book_bookings b.
// 'null' user (unauthenticated) matches nothing; admin flag sees everything.
const scope = (alias = 'b') => `(
  '{{$accountability.admin}}' = 'true'
  OR ${alias}.tenant::text IN (
    SELECT tu.tenant::text FROM book_tenant_users tu
    WHERE tu.user::text = '{{$accountability.user}}'
    UNION
    SELECT jsonb_array_elements_text((u.book_tenant_ids)::jsonb)
    FROM directus_users u WHERE u.id::text = '{{$accountability.user}}'
    UNION
    SELECT u.book_tenant::text FROM directus_users u
    WHERE u.id::text = '{{$accountability.user}}' AND u.book_tenant IS NOT NULL
  )
)`;

const DAYS_14 = `WITH days AS (
  SELECT generate_series(
    ((now() AT TIME ZONE 'Asia/Manila')::date - 13),
    (now() AT TIME ZONE 'Asia/Manila')::date,
    interval '1 day'
  )::date AS day
)`;

// Each entry: flow name → gather SQL → exec code returning the ECharts option.
const CHARTS = [
  {
    flow: 'chart_revenue_14d',
    panel: 'Revenue · 14 days',
    pos: { x: 1, y: 51, w: 27, h: 24 },
    icon: 'show_chart',
    sql: `${DAYS_14},
rev AS (
  SELECT (p.paid_at AT TIME ZONE 'Asia/Manila')::date AS day, SUM(p.amount) AS total
  FROM book_payments p
  JOIN book_bookings b ON b.id = p.booking
  WHERE p.status = 'paid'
    AND (p.paid_at AT TIME ZONE 'Asia/Manila')::date >= (now() AT TIME ZONE 'Asia/Manila')::date - 13
    AND ${scope('b')}
  GROUP BY 1
)
SELECT to_char(d.day, 'Mon DD') AS label, COALESCE(r.total, 0)::float AS value
FROM days d LEFT JOIN rev r ON r.day = d.day
ORDER BY d.day`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No revenue in the last 14 days', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  return {
    grid: { left: 48, right: 16, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis', formatter: '{b}: ₱{c}' },
    xAxis: { type: 'category', data: rows.map(r => r.label), axisLabel: { fontSize: 10, color: '#64748b' } },
    yAxis: { type: 'value', name: 'PHP', nameTextStyle: { fontSize: 10, color: '#64748b' }, axisLabel: { fontSize: 10, color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{ name: 'Revenue', type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 4,
      data: rows.map(r => Number(r.value)),
      lineStyle: { color: '#7c3aed', width: 2.5 }, itemStyle: { color: '#7c3aed' },
      areaStyle: { color: 'rgba(124,58,237,0.15)' } }]
  };
}`,
  },
  {
    flow: 'chart_bookings_14d',
    panel: 'Bookings · 14 days',
    pos: { x: 29, y: 51, w: 27, h: 24 },
    icon: 'bar_chart',
    sql: `${DAYS_14},
bk AS (
  SELECT (b.date_created AT TIME ZONE 'Asia/Manila')::date AS day, COUNT(*) AS n
  FROM book_bookings b
  WHERE b.status <> 'cancelled'
    AND (b.date_created AT TIME ZONE 'Asia/Manila')::date >= (now() AT TIME ZONE 'Asia/Manila')::date - 13
    AND ${scope('b')}
  GROUP BY 1
)
SELECT to_char(d.day, 'Mon DD') AS label, COALESCE(k.n, 0)::int AS value
FROM days d LEFT JOIN bk k ON k.day = d.day
ORDER BY d.day`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No bookings in the last 14 days', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  return {
    grid: { left: 44, right: 16, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis', formatter: '{b}: {c} bookings' },
    xAxis: { type: 'category', data: rows.map(r => r.label), axisLabel: { fontSize: 10, color: '#64748b' } },
    yAxis: { type: 'value', minInterval: 1, name: 'bookings', nameTextStyle: { fontSize: 10, color: '#64748b' }, axisLabel: { fontSize: 10, color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{ name: 'Bookings', type: 'bar', barMaxWidth: 18, data: rows.map(r => Number(r.value)), itemStyle: { color: '#8b5cf6', borderRadius: [3, 3, 0, 0] } }]
  };
}`,
  },
  {
    flow: 'chart_revenue_method',
    panel: 'Revenue by Method · 30d',
    pos: { x: 1, y: 77, w: 27, h: 24 },
    icon: 'donut_large',
    sql: `SELECT initcap(COALESCE(NULLIF(btrim(p.method), ''), 'other')) AS method,
       SUM(p.amount)::float AS total
FROM book_payments p
JOIN book_bookings b ON b.id = p.booking
WHERE p.status = 'paid'
  AND p.paid_at >= now() - interval '30 days'
  AND ${scope('b')}
GROUP BY 1 ORDER BY 2 DESC`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No paid payments in the last 30 days', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  const palette = ['#7c3aed', '#a78bfa', '#c4b5fd', '#6d28d9', '#f59e0b', '#0ea5e9', '#94a3b8'];
  return {
    tooltip: { trigger: 'item', formatter: '{b}: ₱{c} ({d}%)' },
    legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10, color: '#64748b' } },
    series: [{ type: 'pie', radius: ['40%', '66%'], center: ['50%', '44%'],
      label: { fontSize: 10, color: '#475569' },
      data: rows.map((r, i) => ({ name: r.method, value: Number(r.total), itemStyle: { color: palette[i % palette.length] } })) }]
  };
}`,
  },
  {
    flow: 'chart_peak_hours',
    panel: 'Busiest Hours · next 30d',
    pos: { x: 29, y: 77, w: 27, h: 24 },
    icon: 'schedule',
    sql: `SELECT EXTRACT(hour FROM s.start_time)::int AS hr, COUNT(*)::int AS n
FROM book_booking_slots s
JOIN book_bookings b ON b.id = s.booking
WHERE s.status = 'confirmed'
  AND s.date BETWEEN (now() AT TIME ZONE 'Asia/Manila')::date
                  AND (now() AT TIME ZONE 'Asia/Manila')::date + 29
  AND ${scope('b')}
GROUP BY 1 ORDER BY 1`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No confirmed slots in the next 30 days', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  const names = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];
  const byHour = {};
  rows.forEach(r => { byHour[Number(r.hr)] = Number(r.n); });
  const labels = [], vals = [];
  for (let h = 0; h < 24; h++) { labels.push(names[h]); vals.push(byHour[h] || 0); }
  return {
    grid: { left: 40, right: 14, top: 24, bottom: 44 },
    tooltip: { trigger: 'axis', formatter: '{b}: {c} bookings' },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 9, color: '#64748b', interval: 0, rotate: 45 } },
    yAxis: { type: 'value', minInterval: 1, name: 'slots', nameTextStyle: { fontSize: 10, color: '#64748b' }, axisLabel: { fontSize: 10, color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{ type: 'bar', barMaxWidth: 14, data: vals, itemStyle: { color: '#7c3aed', borderRadius: [3, 3, 0, 0] } }]
  };
}`,
  },
  {
    flow: 'chart_court_hours',
    panel: 'Court Hours · next 30d',
    pos: { x: 1, y: 103, w: 56, h: 24 },
    icon: 'sports_tennis',
    sql: `SELECT c.name AS court, ROUND(SUM(s.duration_minutes) / 60.0, 1)::float AS hours
FROM book_booking_slots s
JOIN book_bookings b ON b.id = s.booking
JOIN book_courts c ON c.id = s.court
WHERE s.status = 'confirmed'
  AND s.date BETWEEN (now() AT TIME ZONE 'Asia/Manila')::date
                  AND (now() AT TIME ZONE 'Asia/Manila')::date + 29
  AND ${scope('b')}
GROUP BY c.id, c.name
ORDER BY SUM(s.duration_minutes) DESC`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No court bookings in the next 30 days', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  return {
    grid: { left: 8, right: 36, top: 12, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: {c} hrs' },
    xAxis: { type: 'value', name: 'court-hours', nameTextStyle: { fontSize: 10, color: '#64748b' }, axisLabel: { fontSize: 10, color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: rows.map(r => r.court), inverse: true, axisLabel: { fontSize: 11, color: '#475569' } },
    series: [{ type: 'bar', barMaxWidth: 18, data: rows.map(r => Number(r.hours)), itemStyle: { color: '#7c3aed', borderRadius: [0, 4, 4, 0] } }]
  };
}`,
  },
  {
    flow: 'chart_court_utilization',
    panel: 'Court Utilization · next 30d',
    pos: { x: 1, y: 129, w: 27, h: 24 },
    icon: 'speed',
    // booked minutes / open capacity minutes per court. Capacity = opening
    // hours per weekday (court row wins over venue-wide) minus closures.
    // day_of_week matches JS getDay()/pg EXTRACT(dow): 0=Sun..6=Sat.
    // pct NULL when a court has no published hours (unbookable anyway).
    sql: `WITH dates AS (
  SELECT generate_series(
    (now() AT TIME ZONE 'Asia/Manila')::date,
    (now() AT TIME ZONE 'Asia/Manila')::date + 29,
    interval '1 day'
  )::date AS day
),
courts AS (
  SELECT c.id, c.name, c.tenant
  FROM book_courts c
  WHERE c.status = 'active' AND ${scope('c')}
),
court_day AS (
  SELECT c.id AS court_id, c.name, c.tenant, d.day,
    COALESCE(och.closed, oh.closed, true) AS is_closed,
    COALESCE(och.open_time, oh.open_time) AS ot,
    COALESCE(och.close_time, oh.close_time) AS ct
  FROM courts c
  CROSS JOIN dates d
  LEFT JOIN book_opening_hours och
    ON och.court = c.id AND och.tenant = c.tenant
   AND och.day_of_week = EXTRACT(dow FROM d.day)::int
  LEFT JOIN book_opening_hours oh
    ON oh.court IS NULL AND oh.tenant = c.tenant
   AND oh.day_of_week = EXTRACT(dow FROM d.day)::int
),
open_min AS (
  SELECT court_id, name, tenant, day, ot, ct,
    CASE WHEN is_closed OR ot IS NULL THEN 0
    ELSE GREATEST(0, EXTRACT(epoch FROM (ct - ot)) / 60
      + CASE WHEN ct <= ot THEN 1440 ELSE 0 END)::int END AS open_m
  FROM court_day
),
closed_min AS (
  SELECT om.court_id, om.day, SUM(
    CASE WHEN cl.all_day IS TRUE THEN om.open_m
    ELSE GREATEST(0, EXTRACT(epoch FROM (
      LEAST(om.ct, cl.end_time) - GREATEST(om.ot, cl.start_time))) / 60)::int
    END) AS m
  FROM open_min om
  JOIN book_closures cl
    ON cl.tenant = om.tenant
   AND (cl.court = om.court_id OR cl.court IS NULL)
   AND (cl.date = om.day
        OR (cl.date_start <= om.day AND cl.date_end >= om.day))
   AND (cl.all_day IS TRUE OR (cl.start_time IS NOT NULL AND cl.end_time IS NOT NULL))
  GROUP BY om.court_id, om.day
),
cap AS (
  SELECT om.court_id, om.name,
    SUM(GREATEST(0, om.open_m - COALESCE(cm.m, 0))) AS cap_m
  FROM open_min om
  LEFT JOIN closed_min cm ON cm.court_id = om.court_id AND cm.day = om.day
  GROUP BY om.court_id, om.name
),
bk AS (
  SELECT s.court AS court_id, SUM(s.duration_minutes)::int AS booked_m,
         COUNT(DISTINCT s.booking)::int AS n
  FROM book_booking_slots s
  JOIN book_bookings b ON b.id = s.booking
  WHERE s.status = 'confirmed'
    AND s.date BETWEEN (now() AT TIME ZONE 'Asia/Manila')::date
                    AND (now() AT TIME ZONE 'Asia/Manila')::date + 29
    AND ${scope('b')}
  GROUP BY s.court
)
SELECT cp.name AS court, cap.cap_m::int AS cap_m,
       COALESCE(bk.booked_m, 0) AS booked_m, COALESCE(bk.n, 0) AS bookings,
       CASE WHEN cap.cap_m > 0
            THEN ROUND(COALESCE(bk.booked_m, 0)::numeric / cap.cap_m * 100, 1)
            ELSE NULL END::float AS pct
FROM courts cp
JOIN cap ON cap.court_id = cp.id
LEFT JOIN bk ON bk.court_id = cp.id
ORDER BY pct DESC NULLS LAST, booked_m DESC`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No active courts', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  const names = rows.map(r => r.pct == null ? r.court + ' (no hours)' : r.court);
  const vals = rows.map(r => r.pct == null ? 0 : Number(r.pct));
  return {
    grid: { left: 8, right: 40, top: 12, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: {c}%' },
    xAxis: { type: 'value', max: 100, name: 'utilization %', nameTextStyle: { fontSize: 10, color: '#64748b' }, axisLabel: { fontSize: 10, color: '#64748b', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: names, inverse: true, axisLabel: { fontSize: 11, color: '#475569' } },
    series: [{ type: 'bar', barMaxWidth: 18,
      data: vals.map(v => ({ value: v, itemStyle: { color: v >= 70 ? '#22c55e' : v >= 40 ? '#f59e0b' : '#7c3aed', borderRadius: [0, 4, 4, 0] } })) }]
  };
}`,
  },
  {
    flow: 'chart_bookings_court',
    panel: 'Bookings by Court · next 30d',
    pos: { x: 29, y: 129, w: 27, h: 24 },
    icon: 'scoreboard',
    sql: `SELECT c.name AS court, COUNT(DISTINCT s.booking)::int AS n
FROM book_booking_slots s
JOIN book_bookings b ON b.id = s.booking
JOIN book_courts c ON c.id = s.court
WHERE s.status = 'confirmed'
  AND s.date BETWEEN (now() AT TIME ZONE 'Asia/Manila')::date
                  AND (now() AT TIME ZONE 'Asia/Manila')::date + 29
  AND ${scope('b')}
GROUP BY c.id, c.name
ORDER BY n DESC`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No court bookings in the next 30 days', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  return {
    grid: { left: 8, right: 40, top: 12, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: {c} bookings' },
    xAxis: { type: 'value', minInterval: 1, name: 'bookings', nameTextStyle: { fontSize: 10, color: '#64748b' }, axisLabel: { fontSize: 10, color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: rows.map(r => r.court), inverse: true, axisLabel: { fontSize: 11, color: '#475569' } },
    series: [{ type: 'bar', barMaxWidth: 18, data: rows.map(r => Number(r.n)), itemStyle: { color: '#8b5cf6', borderRadius: [0, 4, 4, 0] } }]
  };
}`,
  },
  {
    flow: 'chart_hours_trend',
    panel: 'Court Hours/day · next 14d',
    pos: { x: 1, y: 155, w: 56, h: 24 },
    icon: 'query_stats',
    sql: `WITH days AS (
  SELECT generate_series(
    (now() AT TIME ZONE 'Asia/Manila')::date,
    (now() AT TIME ZONE 'Asia/Manila')::date + 13,
    interval '1 day'
  )::date AS day
),
hrs AS (
  SELECT s.date AS day, SUM(s.duration_minutes) / 60.0 AS hrs
  FROM book_booking_slots s
  JOIN book_bookings b ON b.id = s.booking
  WHERE s.status = 'confirmed'
    AND s.date BETWEEN (now() AT TIME ZONE 'Asia/Manila')::date
                    AND (now() AT TIME ZONE 'Asia/Manila')::date + 13
    AND ${scope('b')}
  GROUP BY s.date
)
SELECT to_char(d.day, 'Mon DD') AS label, COALESCE(h.hrs, 0)::float AS value
FROM days d LEFT JOIN hrs h ON h.day = d.day
ORDER BY d.day`,
    code: `module.exports = async function(data) {
  const rows = (data.gather && data.gather.rows) || [];
  if (!rows.length) return { title: { text: 'No court bookings in the next 14 days', left: 'center', top: 'middle', textStyle: { color: '#94a3b8', fontSize: 12 } } };
  return {
    grid: { left: 48, right: 16, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis', formatter: '{b}: {c} hrs' },
    xAxis: { type: 'category', data: rows.map(r => r.label), axisLabel: { fontSize: 10, color: '#64748b' } },
    yAxis: { type: 'value', name: 'court-hrs', nameTextStyle: { fontSize: 10, color: '#64748b' }, axisLabel: { fontSize: 10, color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{ name: 'Court hours', type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 4,
      data: rows.map(r => Number(r.value)),
      lineStyle: { color: '#0ea5e9', width: 2.5 }, itemStyle: { color: '#0ea5e9' },
      areaStyle: { color: 'rgba(14,165,233,0.15)' } }]
  };
}`,
  },
];

async function ensureFlow(name) {
  const id = await getId('flows', `filter[name][_eq]=${encodeURIComponent(name)}`);
  if (id) {
    await api('PATCH', `/flows/${id}`, {
      trigger: 'webhook', accountability: 'all', status: 'active',
      options: { error_on_reject: true },
    });
    return id;
  }
  const f = await api('POST', '/flows', {
    name, trigger: 'webhook', accountability: 'all', status: 'active',
    options: { error_on_reject: true },
  });
  return f.id;
}

async function ensureOp(flowId, key, type, pos, options) {
  const id = await getId(
    'operations',
    `filter[flow][_eq]=${flowId}&filter[key][_eq]=${key}`,
  );
  const body = {
    name: key, key, type, flow: flowId,
    position_x: pos.x, position_y: pos.y, options,
  };
  if (id) {
    await api('PATCH', `/operations/${id}`, body);
    return id;
  }
  const op = await api('POST', '/operations', body);
  return op.id;
}

async function ensurePanel(name, p, options, icon, color) {
  const existing = await getId(
    'panels',
    `filter[dashboard][_eq]=${DASH_ID}&filter[name][_eq]=${encodeURIComponent(name)}`,
  );
  const body = {
    dashboard: DASH_ID, name, type: 'echarts-panel', icon, color,
    show_header: true,
    position_x: p.x, position_y: p.y, width: p.w, height: p.h,
    options,
  };
  if (existing) {
    await api('PATCH', `/panels/${existing}`, body);
    return 'patched';
  }
  await api('POST', '/panels', body);
  return 'created';
}

async function main() {
  for (const c of CHARTS) {
    const flowId = await ensureFlow(c.flow);

    const gatherId = await ensureOp(flowId, 'gather', 'likha_sql', { x: 1, y: 1 }, { sql: c.sql });
    const chartId = await ensureOp(flowId, 'chart', 'exec', { x: 2, y: 1 }, { code: c.code });

    // chain: gather → chart; flow.operation = first op
    await api('PATCH', `/operations/${gatherId}`, { resolve: chartId });
    await api('PATCH', `/flows/${flowId}`, { operation: gatherId });

    const r = await ensurePanel(
      c.panel, c.pos,
      { url: `/flows/trigger/${flowId}`, method: 'GET' },
      c.icon, '#7c3aed',
    );
    console.log(`${r === 'created' ? '+' : '='} ${c.panel}  (flow ${flowId.slice(0, 8)})`);
  }

  await api('POST', '/utils/cache/clear', {}).catch(() => {});
  console.log('DONE');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
