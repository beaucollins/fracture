import { createHmac } from 'crypto';
import { IncomingMessage, OutgoingHttpHeaders, IncomingHttpHeaders } from 'http';
import { Parser, Result, isSuccess, failure, mapSuccess, success, isFailure, mapFailure } from '../parse';
import { collectBuffers } from '../client/response-handler';
import { jsonResponse } from '.';

export type Response = Readonly<[number, OutgoingHttpHeaders, NodeJS.ReadableStream]>;
export type Request = Readonly<{
    request: IncomingMessage,
    method: string,
    url: string,
    headers: Readonly<IncomingHttpHeaders>
}>

export type Route<T> = (req: Request) => Promise<Result<T,Request>>|Result<T,Request>;
export type Responder<T> = (context: T, request: Request) => Promise<Response>|Response;
export type Handler = (request: Request) => Promise<Result<Response, Request>>|Result<Response, Request>;
export type RequestHandler<T, B> = (context: T, body: Promise<B>, request: Request) => Response|Promise<Response>;
export type SignedJSONHandler<T, B> = RequestHandler<T, [('signed'|'unsigned'), B]>;

/**
 * Combines multiple routes, executing the first to return a success result.
 *
 * When no handler matches a failure is returned.
 *
 * @param handler
 * @param handlers
 */
export function routes(handler: Handler, ...handlers: Handler[]): Handler {
    if (handlers.length === 0) {
        return handler;
    }
    return async (request) => {
        for (const endpoint of [handler, ...handlers]) {
            const result = await endpoint(request);
            if (isSuccess(result)) {
                return result;
            }
        }
        return failure(request, 'No matching result');
    };
}

/**
 * A handler that calls the responder when the route matches the incoming request.
 *
 * @param route Determines of incoming message matches the route
 * @param responder Called when the route matches
 */
export function route<T>(route: Route<T>, responder: Responder<T>): Handler {
    return async (request) =>
        mapSuccess(
            await route(request),
            async context => success(await responder(context, request))
        );
}

export function routeContext<T extends Record<string, unknown>>(
    route: {[K in keyof T]: Route<T[K]>},
    responder: Responder<T>
): Handler {
    const matcher = context(route);
    return async (request) =>
        await mapSuccess(
            await matcher(request),
            async match => success(await responder(match, request))
        );
}

/**
 * Given two routes, produces a route that requires both to match and combines both
 * matches into a tuple.
 *
 * @param a Route context matcher
 * @param b Route context matcher
 */
export function both<A, B>(a: Route<A>, b: Route<B>): Route<[A,B]> {
    return async req => await mapSuccess(
        await a(req),
        async resultA => mapSuccess(
            await b(req),
            resultB => success<[A, B]>([resultA, resultB])
        )
    );
}

/**
 * Reads the request body into a buffer and resolves it.
 */
function resolveBuffer(request: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        collectBuffers()(request, buffers => resolve(Buffer.concat(buffers)), reject);
    });
}

/**
 * Reads the body into a Buffer and calls the RequestHandler with the buffer.
 */
export function readBody<T>(bodyHandler: RequestHandler<T, Buffer> ): Responder<T> {
    return (context, request) =>
        bodyHandler(context, resolveBuffer(request.request), request);
}

/**
 * Read the incoming request body and resolves as parsed JSON object.
 *
 * @param bodyHandler R
 */
export function readJson<T>(bodyHandler: RequestHandler<T, any>): Responder<T> {
    return (context, request) =>
        bodyHandler(
            context,
            resolveBuffer(request.request)
                .then(buffer => JSON.parse(buffer.toString('utf8'))),
            request
        );
}

export function parseJson<C,T>(parser: Parser<any, T>, handler: RequestHandler<C,Result<any, T>>): Responder<C> {
    return readJson<C>((context, body, request) =>
        handler(
            context,
            body.then(parser),
            request
        )
    )
}

/**
 * Compare a signature with a shared hmac sha256 base64 encoded secret.
 *
 * - If no signature is provided, handler is called with Promise<['unsigned', body]>
 * - If signature is provided and is valid, handler is called with Promise<['signed', any]>.
 * - If signature is invalid the Promise is reject.d
 *
 * @param secret Shared secret used for HMAC digest computation.
 * @param signature Function that returns the signature for the request
 * @param bodyHandler Endpoint handler that receives the content [(signed|unsigned), any]
 */
export function readSignedJson<T, B>(secret: string, signature: (context: T, request: Request) => void | null | string, bodyHandler: SignedJSONHandler<T, B>): Responder<T> {
    return (context, request) =>
        bodyHandler(
            context,
            resolveBuffer(request.request).then((buffer) => {
                const json = JSON.parse(buffer.toString('utf8'));
                const sig = signature(context, request);
                if (sig == null) {
                    return ['unsigned', json];
                }

                if (checkSignature(buffer, secret, sig)) {
                    return ['signed', json];
                }
                throw new Error('Invalid signature');
            } ),
            request
        )
}

export default function checkSignature(buffer: Buffer, secret: string, signature: string): boolean {
    const hmac = createHmac('sha256', secret);
    hmac.update(buffer);
    const digest = hmac.digest('base64');
    return signature == digest;
}

export function context<R extends Record<string, unknown>>(matchers: {[K in keyof R]: Route<R[K]>}): Route<R> {
    return async (request) => {
        const matches = {} as R;
        for (const key in matchers) {
            const matched = await matchers[key](request);
            if (isFailure(matched)) {
                return matched;
            }
            matches[key] = matched.value;
        }
        return success(matches);
    }
}

/**
 * Returns a single request header value.
 */
export function requestHeader(headerNames: string[], defaultValue?: string) {
    return (request: Request): void | string => {
        for(const header of headerNames) {
            const value = request.headers[header];
            if (value == null) {
                continue;
            }
            if (Array.isArray(value)) {
                if (value[0] == null) {
                    continue;
                }
                return value[0];
            } else {
                return value;
            }
        }
        return defaultValue;
    }
}

/**
 * Request content type header.
 */
export const contentType = requestHeader(['content-type']);


export function prefix<S extends string>(pathPrefix: S): Route<S> {
    return request => request.url?.startsWith(pathPrefix)
        ? success(pathPrefix)
        : failure(request, `URL does not begin with ${pathPrefix}`);
}

export function withPrefix<T extends string>(handler: Handler): Responder<T> {
    return async (context, request) => {
        const prefixed: Request = { ...request, url: request.url.slice(context.length) };
        const result = mapFailure(
            await handler(prefixed),
            failure => success(jsonResponse(404, {}, {status: 'not-found', reason: failure.reason})),
        );
        return result.value;
    }
}

export function routeNamespace<S extends string>(pathPrefix: S, handler: Handler): Handler {
    return route(prefix(pathPrefix), withPrefix(handler));
}
