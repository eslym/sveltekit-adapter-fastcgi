import { type IncomingRequest, Server, Role, Status } from '@eslym/fastcgi';
import { assert_env, common_env, env, numeric, truthy } from './env';

export function start(handle: (res: IncomingRequest) => void) {
    assert_env(new Set(common_env));

    const server = new Server({
        fastcgi: {
            FCGI_MAX_CONNS: numeric(env('FCGI_MAX_CONNS')),
            FCGI_MAX_REQS: numeric(env('FCGI_MAX_REQS')),
            FCGI_MPXS_CONNS: truthy(env('FCGI_MPXS_CONNS', 'true'))
        }
    });

    server.on('error', (error) => {
        console.error(error);
    });

    server.on('request', (req) => {
        if (req.role !== Role.RESPONDER) {
            req.end(0, Status.UNKNOWN_ROLE);
            return;
        }
        handle(req);
    });

    const socket_path = env('SOCKET_PATH');
    if (socket_path) {
        server.listen(socket_path);
    } else {
        server.listen(numeric(env('PORT'), 9000), env('HOST', '0.0.0.0'));
    }
}
