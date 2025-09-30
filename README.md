To install dependencies:
```sh
bun install
```

Build the PWA frontend:
```sh
bun run client:build
```

To run the Hono backend (serves the built frontend on `/`):
```sh
bun run dev
```

Open http://localhost:3000

During development you can run the React dev server with hot reload:
```sh
bun run client:dev
```

It proxies API requests to the Bun server.
