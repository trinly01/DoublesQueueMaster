import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { 
        path: '', 
        component: () => import('pages/PlayerPage.vue'),
        meta: { requiresAuth: true }
      },
      { 
        path: 'login', 
        component: () => import('pages/LoginPage.vue'),
        meta: { requiresUnauth: true }
      },
      { 
        path: 'register', 
        component: () => import('pages/RegisterPage.vue'),
        meta: { requiresUnauth: true }
      },
      { 
        path: 'forgot-password', 
        component: () => import('pages/ForgotPasswordPage.vue'),
        meta: { requiresUnauth: true }
      },
      { 
        path: 'reset-password', 
        component: () => import('pages/ResetPasswordPage.vue'),
        meta: { requiresUnauth: true }
      },
      { 
        path: 'club/:clubId', 
        component: () => import('pages/ClubPage.vue'),
        meta: { requiresAuth: true }
      }
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
