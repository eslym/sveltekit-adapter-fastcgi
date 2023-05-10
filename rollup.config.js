import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json'));

/** @type {import('rollup').RollupOptions[]} */
export default [
    {
        input: 'src/index.ts',
        output: {
            format: 'esm',
            dir: 'dist'
        },
        plugins: [
            typescript({
                declaration: true,
                declarationDir: 'dist',
                include: ['src/*.ts', 'ambient.d.ts']
            })
        ],
        external: [Object.keys(pkg.dependencies), /^node:/, ...builtinModules]
    },
    {
        input: {
            simple: 'src/files/simple.ts',
            cluster: 'src/files/cluster/master.ts',
            worker: 'src/files/cluster/worker.ts'
        },
        output: {
            format: 'esm',
            dir: 'dist/files',
            chunkFileNames: 'lib/[name].js'
        },
        plugins: [
            typescript({
                declaration: false,
                include: ['src/files/**/*.ts', 'ambient.d.ts']
            }),
            nodeResolve({ preferBuiltins: true }),
            json()
        ],
        external: ['SHIMS', 'SERVER', 'MANIFEST', /^node:/, ...builtinModules]
    },
    {
        input: 'src/files/shims.js',
        output: {
            format: 'esm',
            dir: 'dist/files'
        },
        plugins: [
            nodeResolve({
                preferBuiltins: true
            }),
            commonjs()
        ],
        external: builtinModules
    }
];
