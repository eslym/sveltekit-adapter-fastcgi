# @eslym/sveltekit-adapter-fastcgi

A package to serve sveltekit app with fastcgi (which might be a very stupid idea).

Supports simple hosting and cluster mode. Cluster mode will automatically spawn and kill workers based on configuration and server load.

## Install

```bash
npm i -D @eslym/sveltekit-adapter-fastcgi
```

```bash
yarn add -D @eslym/sveltekit-adapter-fastcgi
```

## Usage

```js
// svelte.config.js
import adapter from '@eslym/sveltekit-adapter-fastcgi';

export default {
    kit: {
        adapter: adapter({
            mode: 'simple' // or 'cluster'
        })
        // ...
    }
};
```

## Runtime Environment

### Common Environment

-   `SOCKET_PATH`: Path to the socket file which the server will listen to. Otherwise, it will listen to `HOST` and `PORT`.
-   `HOST`: Hostname to listen to. Default: `localhost`.
-   `PORT`: Port to listen to. Default: `9000`.
-   `BODY_SIZE_LIMIT`: Maximum body size in bytes. Default: `1024 * 1024 * 5` (5MB).
-   `REQUEST_READ_TIMEOUT`: Maximum time to read request in milliseconds. Default: `10000`.
-   `FCGI_MAX_CONNS`: Maximum number of concurrent connections.
-   `FCGI_MAX_REQS`: Maximum number of concurrent requests.
-   `FCGI_MPXS_CONNS`: Multiplexing connections.

### Cluster Mode Environment

-   `QUEUE_TIMEOUT`: Maximum time to wait for a request to be assigned to a worker in milliseconds. Default: `10000`.
-   `IDLE_KILL_TIMEOUT`: Maximum time to wait for a worker to finish its request and kill it in milliseconds. Default: `30000`.
-   `WORKER_MAX_REQUESTS`: Maximum number of requests a worker can handle concurrently. Default: `5`.
-   `WORKER_COUNT_MAX`: Maximum number of workers. Default: `os.cpus().length`.
-   `WORKER_COUNT_MIN`: Minimum number of workers. Default: `1`.
