import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split node_modules into vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react-dom')) {
              return 'vendor-react-dom';
            }
            if (id.includes('react/') || id.includes('react\\')) {
              return 'vendor-react';
            }
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
            if (id.includes('date-fns') || id.includes('react-day-picker')) {
              return 'vendor-dates';
            }
            if (id.includes('embla-carousel')) {
              return 'vendor-embla';
            }
            if (id.includes('vaul')) {
              return 'vendor-vaul';
            }
            if (id.includes('input-otp')) {
              return 'vendor-input-otp';
            }
            if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
              return 'vendor-forms';
            }
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }
            if (id.includes('lodash')) {
              return 'vendor-lodash';
            }
            return 'vendor';
          }

          // Split framework and react packages into separate chunk
          if (id.includes('@gears-frontx/framework') || id.includes('@gears-frontx/react')) {
            return 'hai3-core';
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
