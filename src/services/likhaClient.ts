import {
  createLikha,
  authentication,
  rest,
  realtime,
  type AuthenticationData,
} from '@likha-erp/likha-sdk';
import { LocalStorage } from 'quasar';

// Custom Storage adapter for Likha SDK utilizing Quasar's LocalStorage
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

const likhaClient = createLikha('https://dink-it.zyberlab.com')
  .with(authentication('json', { storage }))
  .with(rest())
  .with(
    realtime({
      authMode: 'handshake',
      reconnect: { delay: 1000, retries: 10 },
    }),
  );

export { likhaClient };
