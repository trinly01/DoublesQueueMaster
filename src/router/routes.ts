import { RouteRecordRaw } from 'vue-router';
import MainLayout from 'layouts/MainLayout.vue';
import PlayerPage from 'pages/PlayerPage.vue';
import ClubPage from 'pages/ClubPage.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        component: PlayerPage,
        meta: { requiresAuth: true },
      },
      {
        path: 'login',
        component: () => import('pages/LoginPage.vue'),
        meta: { requiresUnauth: true },
      },
      {
        path: 'register',
        component: () => import('pages/RegisterPage.vue'),
        meta: { requiresUnauth: true },
      },
      {
        path: 'forgot-password',
        component: () => import('pages/ForgotPasswordPage.vue'),
        meta: { requiresUnauth: true },
      },
      {
        path: 'reset-password',
        component: () => import('pages/ResetPasswordPage.vue'),
        meta: { requiresUnauth: true },
      },
      {
        path: 'club/:clubId',
        component: ClubPage,
        meta: { requiresAuth: true },
      },
      {
        path: 'openplay',
        component: ClubPage,
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
