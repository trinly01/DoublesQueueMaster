import { boot } from 'quasar/wrappers';
import { likhaClient } from 'src/services/likhaClient';

export default boot(({ app }) => {
  app.config.globalProperties.$likha = likhaClient;
});
