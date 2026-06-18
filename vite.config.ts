import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'host',
      shared: {
        react: { singleton: false, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: false, requiredVersion: '^19.0.0' },
        tailwindcss: { singleton: false },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', '@globaltypesystem/gts-ts'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split node_modules into vendor chunks
          if (id.includes('node_modules')) {
            // Split React and React DOM separately
            if (id.includes('react-dom')) {
              return 'vendor-react-dom';
            }
            if (id.includes('react/') || id.includes('react\\')) {
              return 'vendor-react';
            }

            // Split large charting library
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }

            // Split date libraries
            if (id.includes('date-fns') || id.includes('react-day-picker')) {
              return 'vendor-dates';
            }

            // Split carousel library
            if (id.includes('embla-carousel')) {
              return 'vendor-embla';
            }

            // Split drawer library
            if (id.includes('vaul')) {
              return 'vendor-vaul';
            }

            // Split OTP library
            if (id.includes('input-otp')) {
              return 'vendor-input-otp';
            }

            // Split form libraries (react-hook-form + zod + resolvers)
            if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
              return 'vendor-forms';
            }

            // Split Radix UI primitives (they're relatively small individually but many)
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }

            // Split other large utilities
            if (id.includes('lodash')) {
              return 'vendor-lodash';
            }

            // All other node_modules go to vendor chunk
            return 'vendor';
          }

          // Split framework and react packages into separate chunk
          if (id.includes('@gears-frontx/framework') || id.includes('@gears-frontx/react')) {
            return 'hai3-core';
          }
          // Split React and React DOM
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react';
          }
        },
      },
    },
    // Increase chunk size warning limit or disable it
    chunkSizeWarningLimit: 500,
  },
});
