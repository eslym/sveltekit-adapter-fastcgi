declare global {
    const ENV_PREFIX: string;
}

export const common_env = [
    'SOCKET_PATH',
    'HOST',
    'PORT',
    'BODY_SIZE_LIMIT',
    'REQUEST_READ_TIMEOUT',
    'FCGI_MAX_CONNS',
    'FCGI_MAX_REQS',
    'FCGI_MPXS_CONNS'
] as const;

export function assert_env(expected: Set<string>) {
    if (ENV_PREFIX) {
        for (const name in process.env) {
            if (name.startsWith(ENV_PREFIX)) {
                const unprefixed = name.slice(ENV_PREFIX.length);
                if (!expected.has(unprefixed)) {
                    throw new Error(
                        `You should change envPrefix (${ENV_PREFIX}) to avoid conflicts with existing environment variables — unexpectedly saw ${name}`
                    );
                }
            }
        }
    }
}

export function env(name: (typeof common_env)[number], fallback?: string): string;
export function env(name: string, fallback?: string): string;

export function env(name: string, fallback: string): string;
export function env(name: string): string | undefined;
export function env(name: string, fallback?: string) {
    const prefixed = ENV_PREFIX + name;
    return prefixed in process.env ? process.env[prefixed] : fallback;
}

export function numeric(value: string | undefined, fallback: number): number;
export function numeric(value: string | undefined): number | undefined;
export function numeric(value: string | undefined, fallback?: number) {
    const val = parseInt(`${value}`);
    return isNaN(val) ? fallback : val;
}

export function truthy(value: string) {
    const val = value.toLowerCase();
    return val === 'true' || val === '1';
}
