// Node loader hook: points '@netlify/blobs' at the in-memory mock. Used with `node --import ./test/loader.mjs`.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === '@netlify/blobs') return { url: ${JSON.stringify(pathToFileURL(new URL('./mock-blobs.mjs', import.meta.url).pathname).href)}, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);
