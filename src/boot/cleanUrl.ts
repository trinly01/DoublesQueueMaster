import { boot } from 'quasar/wrappers';

/**
 * Cleans Facebook/tracking query params from the URL and handles
 * query-param deep links (?r=) for hash-router compatibility.
 *
 * Facebook Messenger and other platforms are known to strip or
 * mishandle # hash fragments. This boot file:
 * 1. Strips fbclid, utm_*, gclid, ttclid from the URL bar
 * 2. If a ?r= param is present, redirects to #/ + r value
 */
export default boot(() => {
  const loc = window.location;
  const params = new URLSearchParams(loc.search);

  // 1. Deep-link fallback: ?r=/club/san.fabian.dinkers -> #/club/san.fabian.dinkers
  const redirectPath = params.get('r');
  if (redirectPath) {
    const cleanSearch = stripTrackingParams(params);
    cleanSearch.delete('r');
    const newSearch = cleanSearch.toString();
    const pathname = loc.pathname.replace(/\/+$/, '');
    const newUrl =
      loc.origin +
      pathname +
      (newSearch ? `?${newSearch}` : '') +
      '#' +
      redirectPath;
    window.location.replace(newUrl);
    return;
  }

  // 2. Strip known tracking params from the URL bar (no page reload)
  if (hasTrackingParam(params)) {
    const cleanSearch = stripTrackingParams(params);
    const newSearch = cleanSearch.toString();
    const newUrl =
      loc.origin + loc.pathname + (newSearch ? `?${newSearch}` : '') + loc.hash;
    window.history.replaceState({}, '', newUrl);
  }
});

function hasTrackingParam(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (
      key === 'fbclid' ||
      key.startsWith('utm_') ||
      key === 'gclid' ||
      key === 'ttclid' ||
      key === 'wbraid'
    ) {
      return true;
    }
  }
  return false;
}

function stripTrackingParams(params: URLSearchParams): URLSearchParams {
  const cleaned = new URLSearchParams();
  params.forEach((value, key) => {
    if (
      key !== 'fbclid' &&
      !key.startsWith('utm_') &&
      key !== 'gclid' &&
      key !== 'ttclid' &&
      key !== 'wbraid'
    ) {
      cleaned.append(key, value);
    }
  });
  return cleaned;
}
