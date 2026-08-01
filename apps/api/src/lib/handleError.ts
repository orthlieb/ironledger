/**
 * Shared route error-handler factories.
 *
 * Every route plugin used to carry its own `handleError(reply)` helper. They
 * came in three shapes; this module is the single source for all of them so the
 * opaque-500 body and log tags live in one place:
 *
 *   makeHandleError(tag)      — generic: log under `[tag]`, reply opaque 500.
 *                               (userData/maps, ai, sessionLog)
 *   makeTypedErrorHandler(E)  — map a typed error class (statusCode/name/
 *                               message) to its response, else opaque 500.
 *                               (characters → CharacterError)
 *   makeStatusCodeErrorHandler() — read statusCode/message off any error.
 *                               (admin)
 *
 * Each returns a `(reply) => (err) => void` so existing call sites keep working
 * unchanged: `const handleError = makeHandleError('…')` then
 * `.catch(handleError(reply))` or `handleError(reply)(err)`.
 *
 * NOTE: auth.ts keeps its own per-route `instanceof` blocks — those also emit
 * security-audit events keyed by err.code, so they are not pure error mapping
 * and don't belong here.
 */

import type { FastifyReply } from 'fastify';

/**
 * The canonical opaque "something failed" 500 body. Deliberately generic so
 * handlers never leak internals to clients. A fresh object each call.
 */
export function internalServerError() {
  return {
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  };
}

/**
 * Generic handler for routes whose services throw only unexpected errors:
 * log the error under `[tag]` (matching the pre-dedup per-file tags) and
 * reply with an opaque 500.
 */
export function makeHandleError(tag: string) {
  return (reply: FastifyReply) =>
    (err: unknown): void => {
      console.error(`[${tag}]`, err);
      reply.status(500).send(internalServerError());
    };
}

/**
 * Handler that maps a typed error class carrying `statusCode`/`name`/`message`
 * (e.g. characterService's CharacterError) to its response, falling back to an
 * opaque 500 for anything else. The class is passed in so this stays in lib
 * without importing a service.
 */
export function makeTypedErrorHandler<E extends Error & { statusCode: number }>(
  ErrorClass: new (...args: never[]) => E,
) {
  return (reply: FastifyReply) =>
    (err: unknown): void => {
      if (err instanceof ErrorClass) {
        reply.status(err.statusCode).send({
          statusCode: err.statusCode,
          error: err.name,
          message: err.message,
        });
      } else {
        reply.status(500).send(internalServerError());
      }
    };
}

/**
 * Handler that reads `statusCode` (and message) off any error and echoes it —
 * used by admin routes whose services throw errors already carrying an HTTP
 * status. Sub-500 statuses surface their message; 5xx stays opaque.
 */
export function makeStatusCodeErrorHandler() {
  return (reply: FastifyReply) =>
    (err: unknown): void => {
      const e = err as { statusCode?: number; code?: string; message?: string };
      const statusCode = e.statusCode ?? 500;
      reply.status(statusCode).send({
        statusCode,
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: statusCode < 500 ? (e.message ?? 'Error') : 'An unexpected error occurred',
      });
    };
}
