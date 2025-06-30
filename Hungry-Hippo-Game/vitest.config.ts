import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import {resolve} from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        coverage: {
            reporter: ['text','html'],
            reportsDirectory: '../documentation/static/coverage',
        }
    }
})