import { defineConfig } from 'vitepress'

// Use environment variable for base path, default to '/' for local dev.
// For GitHub Pages project site, set to '/FrontX/' or '/repo-name/'.
// Icon/manifest hrefs are prefixed with this so they resolve under the base in production.
const base = process.env.VITE_BASE || '/'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'HAI3 Documentation',
  description: 'AI-Driven Product Development & Framework Documentation',
  base,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['link', { rel: 'icon', type: 'image/x-icon', href: `${base}favicon.ico` }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
    ['link', { rel: 'manifest', href: `${base}site.webmanifest` }],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: { light: '/logo.svg', dark: '/logo-dark.svg' },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'AI Product Lifecycle', link: '/lifecycle/' },
      { text: 'HAI3 Framework', link: '/frontx/' },
      { text: 'Case Studies', link: '/case-studies/' }
    ],

    sidebar: {
      '/lifecycle/': [
        {
          text: 'AI Product Lifecycle',
          items: [
            { text: 'Overview', link: '/lifecycle/' }
          ]
        }
      ],
      '/frontx/': [
        {
          text: 'HAI3 Framework',
          items: [
            { text: 'Overview', link: '/frontx/' }
          ]
        }
      ],
      '/case-studies/': [
        {
          text: 'Case Studies',
          items: [
            { text: 'Overview', link: '/case-studies/' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/HAI3org/HAI3' }
    ],

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/HAI3org/HAI3/edit/main/packages/docs/src/:path',
      text: 'Edit this page on GitHub'
    },

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © 2024-present HAI3org'
    }
  }
})
