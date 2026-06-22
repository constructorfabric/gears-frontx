import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Gears FrontX Documentation',
  description: 'AI-Driven Product Development & Framework Documentation',
  // Use environment variable for base path, default to '/' for local dev
  // For GitHub Pages project site, set to '/FrontX/' or '/repo-name/'
  base: process.env.VITE_BASE || '/',

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'AI Product Lifecycle', link: '/lifecycle/' },
      { text: 'Gears FrontX Framework', link: '/frontx/' },
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
          text: 'Gears FrontX Framework',
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
      { icon: 'github', link: 'https://github.com/Gears FrontXorg/Gears FrontX' }
    ],

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/Gears FrontXorg/Gears FrontX/edit/main/packages/docs/src/:path',
      text: 'Edit this page on GitHub'
    },

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © 2024-present Gears FrontXorg'
    }
  }
})
