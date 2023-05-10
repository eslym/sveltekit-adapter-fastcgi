import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import type { Adapter } from '@sveltejs/kit';
import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';

interface AdapterOptions {
    /**
     * output directory, default: build
     */
    out?: string;

    /**
     * precompress, default: false
     */
    precompress?: boolean;

    /**
     * whether to include polyfill for nodejs, default: true
     */
    polyfill?: boolean;

    /**
     * whether to include polyfill for nodejs, default: ''
     */
    envPrefix?: string;

    /**
     * mode of the server, default: 'simple'
     */
    mode?: 'simple' | 'cluster';
}

const files = fileURLToPath(new URL('./files', import.meta.url).href);

function stringifyOrDefault(value: any, script: string) {
    return value ? JSON.stringify(value) : script;
}

export default function adapter(options: AdapterOptions = {}): Adapter {
    const {
        out = 'build',
        precompress = false,
        polyfill = true,
        envPrefix = '',
        mode = 'simple'
    } = options;
    assert(
        ['simple', 'cluster'].includes(mode),
        new TypeError('mode must be one of "simple" or "cluster"')
    );
    return {
        name: '@eslym/sveltekit-adapter-fastcgi',
        async adapt(builder) {
            const tmp = builder.getBuildDirectory('adapter-fastcgi');

            builder.rimraf(out);
            builder.rimraf(tmp);
            builder.mkdirp(tmp);

            builder.log.minor('Copying assets');
            builder.writeClient(`${out}/client${builder.config.kit.paths.base}`);
            builder.writePrerendered(`${out}/prerendered${builder.config.kit.paths.base}`);

            if (precompress) {
                builder.log.minor('Compressing assets');
                await Promise.all([
                    builder.compress(`${out}/client`),
                    builder.compress(`${out}/prerendered`)
                ]);
            }

            builder.log.minor('Building server');

            builder.writeServer(tmp);

            writeFileSync(
                `${tmp}/manifest.js`,
                `export const manifest = ${builder.generateManifest({ relativePath: './' })};\n\n` +
                    `export const prerendered = new Set(${JSON.stringify(
                        builder.prerendered.paths
                    )});\n`
            );

            const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

            // we bundle the Vite output so that deployments only need
            // their production dependencies. Anything in devDependencies
            // will get included in the bundled code
            const bundle = await rollup({
                input: {
                    index: `${tmp}/index.js`,
                    manifest: `${tmp}/manifest.js`
                },
                external: [
                    // dependencies could have deep exports, so we need a regex
                    ...Object.keys(pkg.dependencies || {}).map((d) => new RegExp(`^${d}(\\/.*)?$`))
                ],
                plugins: [
                    nodeResolve({
                        preferBuiltins: true,
                        exportConditions: ['node']
                    }),
                    commonjs({ strictRequires: true }),
                    json()
                ]
            });

            await bundle.write({
                dir: `${out}/server`,
                format: 'esm',
                sourcemap: true,
                chunkFileNames: `chunks/[name]-[hash].js`
            });

            const adapter = await rollup({
                input:
                    mode === 'cluster'
                        ? {
                              index: `${files}/cluster.js`,
                              worker: `${files}/worker.js`
                          }
                        : {
                              index: `${files}/simple.js`
                          },
                external: ['SHIMS', 'SERVER', 'MANIFEST'],
                plugins: [
                    nodeResolve({
                        preferBuiltins: true,
                        exportConditions: ['node']
                    })
                ]
            });

            await adapter.write({
                dir: `${tmp}/adapter`,
                name: 'index.js',
                format: 'esm',
                chunkFileNames: `lib-[name].js`
            });

            builder.copy(`${tmp}/adapter`, out, {
                replace: {
                    MANIFEST: './server/manifest.js',
                    SERVER: './server/index.js',
                    SHIMS: './shims.js',
                    ENV_PREFIX: stringifyOrDefault(envPrefix, '""')
                }
            });

            const shims = polyfill ? readFileSync(`${files}/shims.js`, 'utf-8') : '';

            writeFileSync(`${out}/shims.js`, shims, 'utf-8');
        }
    };
}
