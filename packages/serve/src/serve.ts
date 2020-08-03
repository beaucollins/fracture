import { Parser, Result, isSuccess, failure, mapSuccess, success, isFailure, mapFailure } from '@fracture/parse';
import { IncomingMessage, OutgoingHttpHeaders, IncomingHttpHeaders, ServerResponse } from 'http';
import { createHmac } from 'crypto';
import { Readable } from 'stream';

export type Response = Readonly<[number, OutgoingHttpHeaders, NodeJS.ReadableStream]>;
export type Request = Readonly<{
    request: IncomingMessage,
    method: string,
    url: string,
    headers: Readonly<IncomingHttpHeaders>
}>

/**
 * A Route is a function that receives a Request and returns a success with the route context
 * information _or_ a failure with the original request.
 */
export type Route<T> = (req: Request) => Promise<Result<T,Request>>|Result<T,Request>;

/**
 * Given a matched Route<T> context and a Request, returns a Response to be served.
 */
export type Responder<T> = (context: T, request: Request) => Promise<Response>|Response;

/**
 * Givne a Request, returns a Success of the Response or a Failure of the original Request.
 * Effectively the combination of a Route<T> and a Responder<T>
 */
export type Handler = (request: Request) => Promise<Result<Response, Request>>|Result<Response, Request>;

/**
 * Given a context T, body Promise<B> and a Request resolves a Response. This is the interface
 * for reading request bodies and probably can be renamed to make that clearer.
 */
export type RequestHandler<T, B> = (context: T, body: Promise<B>, request: Request) => Response|Promise<Response>;

/**
 * A RequestHandler that identifies a body is signed or unsigned.
 */
export type SignedJSONHandler<T, B> = RequestHandler<T, [('signed'|'unsigned'), B]>;

/**
 * Interface for integrating with Node's HTTP lib. Receives an http.IncomingMessage and http.ServerResponse
 * and returns the Promise<Response> to be written to the response.
 */
export type Endpoint = (request: IncomingMessage, response: ServerResponse) => Response|Promise<Response>;

/**
 * Creates a Node http server request handler.
 *
 * @param handler The HTTP Request handler
 * @param defaultHandler Handler to use when no handler is identified
 */
export function serve(handler: Handler, defaultHandler: (req: Request) => Response|Promise<Response> = notFound): Endpoint {
    return async (req: IncomingMessage, res: ServerResponse) => {
        const request: Request = {
            request: req,
            method: req.method ?? 'GET',
            url: req.url ?? '/',
            headers: req.headers,
        };
        const result = await mapFailure(
            await handler(request),
            async () => success(await defaultHandler(request))
        );

        const [status, headers, stream] = result.value;
        res.writeHead(status, headers);
        stream.pipe(res);
        return result.value;
    }
}

/**
 * Creates a Response to be served with the given status and headers.
 *
 * @param status
 * @param headers
 * @param json
 * @return Response
 */
export function jsonResponse(
    status: number,
    headers: OutgoingHttpHeaders,
    json: any
): Response {
    const body = Buffer.from(JSON.stringify(json));
    const stream = Readable.from([body]);
    return [
        status,
        {
            ...headers,
            'content-type': 'application/json',
            'content-length': body.length,
        },
        stream
    ];
}

/**
 * JSON response of 404 and body {status: 'not-found'}
 */
function notFound(): Response {
    return jsonResponse(404, {}, {status: 'not-found'});
}

/**
 * Creates a Responder<T> than uses the `encoder` to generate the response.
 * @param encoder Function to transform the context T and request into JSON Response args
 */
export function sendJson<T>(encoder: (context: T, request: Request) => [number, OutgoingHttpHeaders, any]): Responder<T> {
    return (context, request) => {
        const [status, headers, data] = encoder(context, request);
        return jsonResponse(status, headers, data);
    }
}

/**
 * Create a route that matches a given request method.
 * @param method Method to match
 */
export function method<T extends ('GET'|'POST')>(method: T): Route<T> {
    return req => req.method === method ? success(method) : failure(req, `method is ${req.method}`)
}

/**
 * Creates a route that matches the exact path e.g. `/users/find`
 * @param path Literal string to match
 */
export function exactPath<T extends string>(path: T): Route<T> {
    return req => req.url === path ? success(path) : failure(req, `Path ${req.url} is not ${path}`)
}

export function always<T>(value: T): () => T {
    return () => value;
}

/**
 * Wraps an Endpoint to add logging
 * @param label Label to use in logged output
 * @param handler Endpoint with logging
 */
export function log(label: string, handler: Endpoint): Endpoint {
    return async (req, res) => {
        const time = Date.now();
        const response = await handler(req, res);
        const [status] = response;
        const executionTime = Date.now();
        res.on('close', () => {
            console.warn(
                '%s %s %s %s %d => response in %d ms, closed in %d ms',
                (new Date()).toISOString(), label, req.method, req.url, status, executionTime - time, Date.now() - time
            );
        })
        return response;
    }
}

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

/**
 * Combines multipe routing contexts into a single context object based on the keys.
 *
 * @example
 *
 *   routeContext({ method: method('POST'), path: exactPath('/some/path)})
 *
 * Matches a request for `POST /some/path` and the context will be of type:
 *
 *   type { method: 'POST', path: '/some/path'}
 *
 * @param route
 * @param responder
 */
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
async function resolveBuffer(request: IncomingMessage): Promise<Buffer> {
    const buffers: Buffer[] = [];
    for await (const data of request) {
        buffers.push(data);
    }
    return Buffer.concat(buffers);
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
 * - If signature is invalid the Promise is rejected
 *
 * @param signature Shared secret used for HMAC digest computation.
 * @param verifySignature Function that returns the signature for the request
 * @param bodyHandler Endpoint handler that receives the content [(signed|unsigned), any]
 */
export function readSignedJson<T, B>(
    signature: (context: T, request: Request) => void | null | string,
    verifySignature: (signature: string, body: Buffer, request: Request) => boolean,
    bodyHandler: SignedJSONHandler<T, B>
  ):Responder<T> {
    return (context, request) =>
        bodyHandler(
            context,
            resolveBuffer(request.request).then((buffer) => {
                const json = JSON.parse(buffer.toString('utf8'));
                const sig = signature(context, request);
                if (sig == null) {
                  return ['unsigned', json];
                }

                if (verifySignature(sig, buffer, request)) {
                  return ['signed', json];
                }
                throw new Error('Invalid signature');
            } ),
            request
        )
  }

export function checkSignature(buffer: Buffer, secret: string, signature: string): boolean {
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
