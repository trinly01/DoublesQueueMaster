import { RouteRecordRaw } from 'vue-router';
import MainLayout from 'layouts/MainLayout.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        component: () => import('pages/LandingPage.vue'),
      },
      {
        path: 'profile',
        component: () => import('pages/PlayerPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'clubs',
        component: () => import('pages/ClubsPage.vue'),
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
        path: 'delete-account',
        component: () => import('pages/DeleteAccountPage.vue'),
      },
      {
        path: 'club/:clubId',
        component: () => import('pages/ClubPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'openplay',
        component: () => import('pages/ClubPage.vue'),
      },
      {
        path: 'play',
        component: () => import('pages/PlayPage.vue'),
      },
      // ── Court booking (/book) ──────────────────────────────
      {
        path: 'book',
        component: () => import('pages/book/BookVenuesPage.vue'),
      },
      {
        path: 'book/v/:slug',
        component: () => import('pages/book/BookVenuePage.vue'),
      },
      {
        path: 'book/v/:slug/book',
        component: () => import('pages/book/BookSlotsPage.vue'),
      },
      {
        path: 'book/checkout',
        component: () => import('pages/book/BookCheckoutPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'book/confirmation/:id',
        component: () => import('pages/book/BookConfirmationPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'book/my',
        component: () => import('pages/book/BookMyPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'book/my/:id',
        component: () => import('pages/book/BookBookingPage.vue'),
        meta: { requiresAuth: true },
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
