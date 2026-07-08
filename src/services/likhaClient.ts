import {
  createLikha,
  authentication,
  rest,
  realtime,
  type AuthenticationData,
} from '@likha-erp/likha-sdk';
import { LocalStorage } from 'quasar';

const LIKHA_URL = 'https://api.dinkmatch.club';

// Custom Storage adapter for Likha SDK utilizing Quasar's LocalStorage.
// Token mode (not cookies) so auth works on iOS Safari, which blocks
// cross-site cookies between the frontend and the Directus backend domain.
class QuasarStorage {
  get(): AuthenticationData | null {
    const data = LocalStorage.getItem('likha-data');
    return data ? (data as AuthenticationData) : null;
  }
  set(data: AuthenticationData | null) {
    if (data === null) {
      LocalStorage.remove('likha-data');
    } else {
      LocalStorage.set('likha-data', data);
    }
  }
}

const storage = new QuasarStorage();

const likhaClient = createLikha(LIKHA_URL)
  .with(authentication('json', { storage, credentials: 'include' }))
  .with(rest())
  .with(
    realtime({
      authMode: 'handshake',
      reconnect: { delay: 1000, retries: 10 },
    }),
  );

export { likhaClient, LIKHA_URL };
