# Icon placeholders

The actual PNG icons are generated at runtime from Base64-encoded payloads in `src/icons.ts` so we can avoid committing binary
files to git.
The directory is kept to preserve the `/icons/` URL structure referenced by the manifest and service worker.
