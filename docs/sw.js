if (!self.define) {
  let e,
    s = {};
  const i = (i, c) => (
    (i = new URL(i + '.js', c).href),
    s[i] ||
      new Promise((s) => {
        if ('document' in self) {
          const e = document.createElement('script');
          (e.src = i), (e.onload = s), document.head.appendChild(e);
        } else (e = i), importScripts(i), s();
      }).then(() => {
        let e = s[i];
        if (!e) throw new Error(`Module ${i} didn’t register its module`);
        return e;
      })
  );
  self.define = (c, n) => {
    const f =
      e ||
      ('document' in self ? document.currentScript.src : '') ||
      location.href;
    if (s[f]) return;
    let o = {};
    const a = (e) => i(e, f),
      r = { module: { uri: f }, exports: o, require: a };
    s[f] = Promise.all(c.map((e) => r[e] || a(e))).then((e) => (n(...e), o));
  };
}
define(['./workbox-37fde244'], function (e) {
  'use strict';
  e.setCacheNameDetails({ prefix: 'doubles-queue-master' }),
    self.skipWaiting(),
    e.clientsClaim(),
    e.precacheAndRoute(
      [
        {
          url: 'DoublesQueueMaster/ErrorNotFound-D4DmHF_G.js',
          revision: '6283a305d044b0edf9b0a4fd2d04c633',
        },
        {
          url: 'DoublesQueueMaster/flUhRq6tzZclQEJ-Vdg-IuiaDsNa-Dr0goTwe.woff',
          revision: '3e1afe59fa075c9e04c436606b77f640',
        },
        {
          url: 'DoublesQueueMaster/flUhRq6tzZclQEJ-Vdg-IuiaDsNcIhQ8tQ-D-x-0Q06.woff2',
          revision: 'a4160421d2605545f69a4cd6cd642902',
        },
        {
          url: 'DoublesQueueMaster/format-DTreOZ-n.js',
          revision: 'aa805a7c6b719612375e17f462d76c45',
        },
        {
          url: 'DoublesQueueMaster/index-CFdL59NB.js',
          revision: 'a0363f8d9e6c8b0e4093350233fe4eba',
        },
        {
          url: 'DoublesQueueMaster/index-DhxaS_3I.css',
          revision: '22fe0e50653c30e515c09d8265dbd0e3',
        },
        {
          url: 'DoublesQueueMaster/IndexPage-BceNypCQ.css',
          revision: 'df7928dfdaaf3b24ea60173536bfb3ee',
        },
        {
          url: 'DoublesQueueMaster/IndexPage-BdNYb0YV.js',
          revision: 'de020a8b85dcfa2bf0871e59d847fa70',
        },
        {
          url: 'DoublesQueueMaster/KFOkCnqEu92Fr1MmgVxIIzQ-C5u4Lasg.woff',
          revision: '4aa2e69855e3b83110a251c47fdd05fc',
        },
        {
          url: 'DoublesQueueMaster/KFOlCnqEu92Fr1MmEU9fBBc--j0ba7u44.woff',
          revision: '40bcb2b8cc5ed94c4c21d06128e0e532',
        },
        {
          url: 'DoublesQueueMaster/KFOlCnqEu92Fr1MmSU5fBBc--CDXAfhRl.woff',
          revision: 'ea60988be8d6faebb4bc2a55b1f76e22',
        },
        {
          url: 'DoublesQueueMaster/KFOlCnqEu92Fr1MmWUlfBBc--7z0HfM8a.woff',
          revision: '0774a8b7ca338dc1aba5a0ec8f2b9454',
        },
        {
          url: 'DoublesQueueMaster/KFOlCnqEu92Fr1MmYUtfBBc--Yv75Cvt_.woff',
          revision: 'bcb7c7e2499a055f0e2f93203bdb282b',
        },
        {
          url: 'DoublesQueueMaster/KFOmCnqEu92Fr1Mu4mxM-CEBEUyyq.woff',
          revision: 'd3907d0ccd03b1134c24d3bcaf05b698',
        },
        {
          url: 'DoublesQueueMaster/MainLayout-ekTW7xPB.js',
          revision: 'c6395632242e6d759d188e72e9d03f84',
        },
        {
          url: 'DoublesQueueMaster/QBtn-4VdOLEtY.js',
          revision: 'b449f851453ead27c96a6cbc1b7c55b8',
        },
        { url: 'favicon.ico', revision: 'f4facfeaed834544d622544acfbb7722' },
        {
          url: 'icons/apple-icon-120x120.png',
          revision: 'd082235f6e6d2109e84e397f66fa868d',
        },
        {
          url: 'icons/apple-icon-152x152.png',
          revision: '3c728ce3e709b7395be487becf76283a',
        },
        {
          url: 'icons/apple-icon-167x167.png',
          revision: '3fec89672a18e4b402ede58646917c2d',
        },
        {
          url: 'icons/apple-icon-180x180.png',
          revision: 'aa47843bd47f34b7ca4b99f65dd25955',
        },
        {
          url: 'icons/favicon-128x128.png',
          revision: 'ab92df0270f054ca388127c9703a4911',
        },
        {
          url: 'icons/favicon-16x16.png',
          revision: 'e4b046d41e08e6fa06626d6410ab381d',
        },
        {
          url: 'icons/favicon-32x32.png',
          revision: '410858b01fa6d3d66b7bf21447c5f1fc',
        },
        {
          url: 'icons/favicon-96x96.png',
          revision: 'db2bde7f824fb4057ffd1c42f6ed756e',
        },
        {
          url: 'icons/icon-128x128.png',
          revision: 'ab92df0270f054ca388127c9703a4911',
        },
        {
          url: 'icons/icon-192x192.png',
          revision: '7659f0d3e9602e71811f8b7cf2ce0e8e',
        },
        {
          url: 'icons/icon-256x256.png',
          revision: 'cf5ad3498fb6fda43bdafd3c6ce9b824',
        },
        {
          url: 'icons/icon-384x384.png',
          revision: 'fdfc1b3612b6833a27a7b260c9990247',
        },
        {
          url: 'icons/icon-512x512.png',
          revision: '2c2dc987945806196bd18cb6028d8bf4',
        },
        {
          url: 'icons/ms-icon-144x144.png',
          revision: '8de1b0e67a62b881cd22d935f102a0e6',
        },
        {
          url: 'icons/safari-pinned-tab.svg',
          revision: '3e4c3730b00c89591de9505efb73afd3',
        },
        { url: 'index.html', revision: '44306495db6c610c35dac258a964e3ee' },
        { url: 'manifest.json', revision: 'b0d8067c04ccdd4add6a4e4bffee769f' },
      ],
      {},
    ),
    e.cleanupOutdatedCaches(),
    e.registerRoute(
      new e.NavigationRoute(e.createHandlerBoundToURL('index.html'), {
        denylist: [/sw\.js$/, /workbox-(.)*\\.js$/],
      }),
    );
});
