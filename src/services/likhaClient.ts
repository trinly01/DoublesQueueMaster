import {
  createLikha,
  authentication,
  rest,
  realtime,
} from '@likha-erp/likha-sdk';

const LIKHA_URL = 'https://dink-it.zyberlab.com';

const likhaClient = createLikha(LIKHA_URL)
  .with(authentication('session', { credentials: 'include' }))
  .with(rest({ credentials: 'include' }))
  .with(
    realtime({
      authMode: 'handshake',
      reconnect: { delay: 1000, retries: 10 },
    }),
  );

export { likhaClient, LIKHA_URL };
