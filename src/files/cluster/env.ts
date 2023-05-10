import { assert_env } from '../env';

assert_env(
    new Set([
        'QUEUE_TIMEOUT',
        'IDLE_KILL_TIMEOUT',
        'WORKER_MAX_REQUESTS',
        'WORKER_COUNT_MAX',
        'WORKER_COUNT_MIN'
    ])
);
