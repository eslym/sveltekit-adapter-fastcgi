import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json'));

/** @type {import('rollup').RollupOptions[]} */
export default [
    {
        input: {
            simple: 'src/files/simple.ts',
            cluster: 'src/files/cluster/master.ts',
            worker: 'src/files/cluster/worker.ts'
        },
        output: {
            format: 'esm',
            dir: 'debug',
            chunkFileNames: 'lib.js',
            sourcemap: true
        },
        plugins: [
            typescript({
                declaration: false,
                include: ['src/files/**/*.ts', 'ambient.d.ts']
            }),
            replace({
                preventAssignment: true,
                values: {
                    SHIMS: './shims.js',
                    SERVER: './server/index.js',
                    MANIFEST: './server/manifest.js',
                    ENV_PREFIX: `""`
                }
            })
        ],
        external: [
            './server/index.js',
            './server/manifest.js',
            '@eslym/fastcgi',
            '@sveltejs/kit/node',
            '@sveltejs/kit/node/polyfills',
            'sirv',
            /^node:/,
            ...builtinModules
        ]
    }
];
