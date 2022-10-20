import {
  Parser,
  Result,
  isSuccess,
  failure,
  mapSuccess,
  success,
  isFailure,
  mapFailure,
} from "@fracture/parse";
import {
  IncomingMessage,
  OutgoingHttpHeaders,
  IncomingHttpHeaders,
  ServerResponse,
} from "http";
import { createHmac } from "crypto";
import { Readable } from "stream";

const STATUSES = {
  // This interim response indicates that everything so far is OK and that the client should continue the request, or ignore the response if the request is already finished.
  100: "Continue",
  // This code is sent in response to an Upgrade request header from the client, and indicates the protocol the server is switching to.
  101: "Switching Protocol",
  // This code indicates that the server has received and is processing the request, but no response is available yet.
  102: "Processing (WebDAV)",
  // This status code is primarily intended to be used with the Link header, letting the user agent start preloading resources while the server prepares a response.
  103: "Early Hints",

  200: "Success",

  //The request has succeeded and a new resource has been created as a result. This is typically the response sent after POST requests, or some PUT requests.
  201: "Created",
  // The request has been received but not yet acted upon. It is noncommittal, since there is no way in HTTP to later send an asynchronous response indicating the outcome of the request. It is intended for cases where another process or server handles the request, or for batch processing.
  202: "Accepted",
  // This response code means the returned meta-information is not exactly the same as is available from the origin server, but is collected from a local or a third-party copy. This is mostly used for mirrors or backups of another resource. Except for that specific case, the "200 OK" response is preferred to this status.
  203: "Non-Authoritative Information",
  //There is no content to send for this request, but the headers may be useful. The user-agent may update its cached headers for this resource with the new ones.
  204: "No Content",
  // Tells the user-agent to reset the document which sent this request.
  205: "Reset Content",
  // This response code is used when the Range header is sent from the client to request only part of a resource.
  206: "Partial Content",

  // The request has more than one possible response. The user-agent or user should choose one of them. (There is no standardized way of choosing one of the responses, but HTML links to the possibilities are recommended so the user can pick.)
  300: "Multiple Choice",
  // The URL of the requested resource has been changed permanently. The new URL is given in the response.
  301: "Moved Permanently",
  // This response code means that the URI of requested resource has been changed temporarily. Further changes in the URI might be made in the future. Therefore, this same URI should be used by the client in future requests.
  302: "Found",
  // The server sent this response to direct the client to get the requested resource at another URI with a GET request.
  303: "See Other",
  // This is used for caching purposes. It tells the client that the response has not been modified, so the client can continue to use the same cached version of the response.
  304: "Not Modified",
  // Defined in a previous version of the HTTP specification to indicate that a requested response must be accessed by a proxy. It has been deprecated due to security concerns regarding in-band configuration of a proxy.
  305: "Use Proxy",
  // The server sends this response to direct the client to get the requested resource at another URI with same method that was used in the prior request. This has the same semantics as the 302 Found HTTP response code, with the exception that the user agent must not change the HTTP method used: If a POST was used in the first request, a POST must be used in the second request.
  307: "Temporary Redirect",
  // This means that the resource is now permanently located at another URI, specified by the Location: HTTP Response header. This has the same semantics as the 301 Moved Permanently HTTP response code, with the exception that the user agent must not change the HTTP method used: If a POST was used in the first request, a POST must be used in the second request.
  308: "Permanent Redirect",

  // The server could not understand the request due to invalid syntax.
  400: "Bad Request",
  // Although the HTTP standard specifies "unauthorized", semantically this response means "unauthenticated". That is, the client must authenticate itself to get the requested response.
  401: "Unauthorized",
  // This response code is reserved for future use. The initial aim for creating this code was using it for digital payment systems, however this status code is used very rarely and no standard convention exists.
  402: "Payment Required",
  // The client does not have access rights to the content; that is, it is unauthorized, so the server is refusing to give the requested resource. Unlike 401, the client's identity is known to the server.
  403: "Forbidden",
  // The server can not find the requested resource. In the browser, this means the URL is not recognized. In an API, this can also mean that the endpoint is valid but the resource itself does not exist. Servers may also send this response instead of 403 to hide the existence of a resource from an unauthorized client. This response code is probably the most famous one due to its frequent occurrence on the web.
  404: "Not Found",
  // The request method is known by the server but is not supported by the target resource. For example, an API may forbid DELETE-ing a resource.
  405: "Method Not Allowed",
  // This response is sent when the web server, after performing server-driven content negotiation, doesn't find any content that conforms to the criteria given by the user agent.
  406: "Not Acceptable",
  // This is similar to 401 but authentication is needed to be done by a proxy.
  407: "Proxy Authentication Required",
  // This response is sent on an idle connection by some servers, even without any previous request by the client. It means that the server would like to shut down this unused connection. This response is used much more since some browsers, like Chrome, Firefox 27+, or IE9, use HTTP pre-connection mechanisms to speed up surfing. Also note that some servers merely shut down the connection without sending this message.
  408: "Request Timeout",
  // This response is sent when a request conflicts with the current state of the server.
  409: "Conflict",
  // This response is sent when the requested content has been permanently deleted from server, with no forwarding address. Clients are expected to remove their caches and links to the resource. The HTTP specification intends this status code to be used for "limited-time, promotional services". APIs should not feel compelled to indicate resources that have been deleted with this status code.
  410: "Gone",
  // Server rejected the request because the Content-Length header field is not defined and the server requires it.
  411: "Length Required",
  // The client has indicated preconditions in its headers which the server does not meet.
  412: "Precondition Failed",
  // Request entity is larger than limits defined by server; the server might close the connection or return an Retry-After header field.
  413: "Payload Too Large",
  // The URI requested by the client is longer than the server is willing to interpret.
  414: "URI Too Long",
  // The media format of the requested data is not supported by the server, so the server is rejecting the request.
  415: "Unsupported Media Type",
  // The range specified by the Range header field in the request can't be fulfilled; it's possible that the range is outside the size of the target URI's data.
  416: "Range Not Satisfiable",
  // This response code means the expectation indicated by the Expect request header field can't be met by the server.
  417: "Expectation Failed",
  // The server refuses the attempt to brew coffee with a teapot.
  418: "I'm a teapot",
  // The request was directed at a server that is not able to produce a response. This can be sent by a server that is not configured to produce responses for the combination of scheme and authority that are included in the request URI.
  421: "Misdirected Request",
  // The request was well-formed but was unable to be followed due to semantic errors.
  422: "Unprocessable Entity (WebDAV)",
  // The resource that is being accessed is locked.
  423: "Locked (WebDAV)",
  // The request failed due to failure of a previous request.
  424: "Failed Dependency (WebDAV)",
  // Indicates that the server is unwilling to risk processing a request that might be replayed.
  425: "Too Early",
  // The server refuses to perform the request using the current protocol but might be willing to do so after the client upgrades to a different protocol. The server sends an Upgrade header in a 426 response to indicate the required protocol(s).
  426: "Upgrade Required",
  // The origin server requires the request to be conditional. This response is intended to prevent the 'lost update' problem, where a client GETs a resource's state, modifies it, and PUTs it back to the server, when meanwhile a third party has modified the state on the server, leading to a conflict.
  428: "Precondition Required",
  // The user has sent too many requests in a given amount of time ("rate limiting").
  429: "Too Many Requests",
  // The server is unwilling to process the request because its header fields are too large. The request may be resubmitted after reducing the size of the request header fields.
  431: "Request Header Fields Too Large",
  // The user-agent requested a resource that cannot legally be provided, such as a web page censored by a government.
  451: "Unavailable For Legal Reasons",

  // The server has encountered a situation it doesn't know how to handle.
  500: "Internal Server Error",
  // The request method is not supported by the server and cannot be handled. The only methods that servers are required to support (and therefore that must not return this code) are GET and HEAD.
  501: "Not Implemented",
  // This error response means that the server, while working as a gateway to get a response needed to handle the request, got an invalid response.
  502: "Bad Gateway",
  // The server is not ready to handle the request. Common causes are a server that is down for maintenance or that is overloaded. Note that together with this response, a user-friendly page explaining the problem should be sent. This response should be used for temporary conditions and the Retry-After: HTTP header should, if possible, contain the estimated time before the recovery of the service. The webmaster must also take care about the caching-related headers that are sent along with this response, as these temporary condition responses should usually not be cached.
  503: "Service Unavailable",
  // This error response is given when the server is acting as a gateway and cannot get a response in time.
  504: "Gateway Timeout",
  // The HTTP version used in the request is not supported by the server.
  505: "HTTP Version Not Supported",
  // The server has an internal configuration error: the chosen variant resource is configured to engage in transparent content negotiation itself, and is therefore not a proper end point in the negotiation process.
  506: "Variant Also Negotiates",
  // The method could not be performed on the resource because the server is unable to store the representation needed to successfully complete the request.
  507: "Insufficient Storage (WebDAV)",
  // The server detected an infinite loop while processing the request.
  508: "Loop Detected (WebDAV)",
  // Further extensions to the request are required for the server to fulfill it.
  510: "Not Extended",
  // The 511 status code indicates that the client needs to authenticate to gain network access.
  511: "Network Authentication Required",
};

export type StatusCode = keyof typeof STATUSES;

export type Response = Readonly<
  [
    status: StatusCode,
    headers: OutgoingHttpHeaders,
    responseStream: NodeJS.ReadableStream
  ]
>;
export type Request = Readonly<{
  request: IncomingMessage;
  method: string;
  url: string;
  headers: Readonly<IncomingHttpHeaders>;
}>;

/**
 * A Route is a function that receives a Request and returns a success with the route context
 * information _or_ a failure with the original request.
 */
export type Route<T> = (
  req: Request
) => Promise<Result<T, Request>> | Result<T, Request>;

/**
 * Given a matched Route<T> context and a Request, returns a Response to be served.
 */
export type Responder<T> = (
  context: T,
  request: Request
) => Promise<Response> | Response;

/**
 * Given a Request, returns a Success of the Response or a Failure of teh original Request.
 * Effectively the combination of a Route<T> and a Responder<T>
 */
export type Handler = (
  request: Request
) => Promise<Result<Response, Request>> | Result<Response, Request>;

/**
 * Given a context T, body Promise<B> and a Request resolves a Response. This is the interface
 * for reading request bodies and probably can be renamed to make that clearer.
 */
export type RequestHandler<T, B> = (
  context: T,
  body: Promise<B>,
  request: Request
) => Response | Promise<Response>;

/**
 * A RequestHandler that identifies a body is signed or unsigned.
 */
export type SignedJSONHandler<T, B> = RequestHandler<
  T,
  ["signed" | "unsigned", B]
>;

/**
 * Interface for integrating with Node's HTTP lib. Receives an http.IncomingMessage and http.ServerResponse
 * and returns the Promise<Response> to be written to the response.
 */
export type Endpoint = (
  request: IncomingMessage,
  response: ServerResponse
) => Response | Promise<Response>;

/**
 * Creates a Node http server request handler.
 *
 * @param handler The HTTP Request handler
 * @param defaultHandler Handler to use when no handler is identified
 */
export function serve(
  handler: Handler,
  defaultHandler: (req: Request) => Response | Promise<Response> = notFound
): Endpoint {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const request: Request = {
      request: req,
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers,
    };
    const result = await mapFailure(await handler(request), async () =>
      success(await defaultHandler(request))
    );

    const [status, headers, stream] = result.value;
    res.writeHead(status, STATUSES[status], headers);
    stream.pipe(res);
    return result.value;
  };
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
  status: StatusCode,
  headers: OutgoingHttpHeaders,
  json: unknown
): Response {
  const body = Buffer.from(JSON.stringify(json));
  const stream = Readable.from([body]);
  return [
    status,
    {
      ...headers,
      "content-type": "application/json",
      "content-length": body.length,
    },
    stream,
  ];
}

/**
 * JSON response of 404 and body {status: 'not-found'}
 */
function notFound(): Response {
  return jsonResponse(404, {}, { status: "not-found" });
}

/**
 * Creates a Responder<T> than uses the `encoder` to generate the response.
 * @param encoder Function to transform the context T and request into JSON Response args
 */
export function sendJson<T>(
  encoder: (
    context: T,
    request: Request
  ) => [StatusCode, OutgoingHttpHeaders, unknown]
): Responder<T> {
  return (context, request) => {
    const [status, headers, data] = encoder(context, request);
    return jsonResponse(status, headers, data);
  };
}

/**
 * Create a route that matches a given request method.
 * @param method Method to match
 */
export function method<T extends "GET" | "POST">(method: T): Route<T> {
  return (req) =>
    req.method === method
      ? success(method)
      : failure(req, `method is ${req.method}`);
}

/**
 * Creates a route that matches the exact path e.g. `/users/find`
 * @param path Literal string to match
 */
export function exactPath<T extends string>(path: T): Route<T> {
  return (req) =>
    req.url === path
      ? success(path)
      : failure(req, `Path ${req.url} is not ${path}`);
}

export function always<T>(value: T): () => T {
  return () => value;
}

/**
 * Wraps an Endpoint to add logging
 * @param label Label to use in logged output
 * @param handler Endpoint with logging
 */
export function log(
  label: string,
  handler: Endpoint,
  shouldLog: (req: Request, status: StatusCode) => boolean
): Endpoint {
  return async (req, res) => {
    const time = Date.now();
    const response = await handler(req, res);
    const [status] = response;
    const executionTime = Date.now();
    shouldLog(req, status) &&
      res.on("close", () => {
        // eslint-disable-next-line no-console
        console.warn(
          "%s %s %s %s %d => response in %d ms, closed in %d ms",
          new Date().toISOString(),
          label,
          req.method,
          req.url,
          status,
          executionTime - time,
          Date.now() - time
        );
      });
    return response;
  };
}

export function logger(
  label: string,
  shouldLog: (req: Request, status: StatusCode) => boolean
): (endpoint: Endpoint) => Endpoint {
  return (endpoint) => log(label, endpoint, shouldLog);
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
    return failure(request, "No matching result");
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
    mapSuccess(await route(request), async (context) =>
      success(await responder(context, request))
    );
}

/**
 * Combines multiple routing contexts into a single context object based on the keys.
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
  route: { [K in keyof T]: Route<T[K]> },
  responder: Responder<T>
): Handler {
  const matcher = context(route);
  return async (request) =>
    await mapSuccess(await matcher(request), async (match) =>
      success(await responder(match, request))
    );
}

/**
 * Given two routes, produces a route that requires both to match and combines both
 * matches into a tuple.
 *
 * @param a Route context matcher
 * @param b Route context matcher
 */
export function both<A, B>(a: Route<A>, b: Route<B>): Route<[A, B]> {
  return async (req) =>
    await mapSuccess(await a(req), async (resultA) =>
      mapSuccess(await b(req), (resultB) => success<[A, B]>([resultA, resultB]))
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
export function readBody<T>(
  bodyHandler: RequestHandler<T, Buffer>
): Responder<T> {
  return (context, request) =>
    bodyHandler(context, resolveBuffer(request.request), request);
}

/**
 * Read the incoming request body and resolves as parsed JSON object.
 *
 * @param bodyHandler R
 */
export function readJson<T>(
  bodyHandler: RequestHandler<T, unknown>
): Responder<T> {
  return (context, request) =>
    bodyHandler(
      context,
      resolveBuffer(request.request).then((buffer) =>
        JSON.parse(buffer.toString("utf8"))
      ),
      request
    );
}

export function parseJson<C, T>(
  parser: Parser<T, unknown>,
  handler: RequestHandler<C, Result<T, unknown>>
): Responder<C> {
  return readJson<C>((context, body, request) =>
    handler(context, body.then(parser), request)
  );
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
  verifySignature: (
    signature: string,
    body: Buffer,
    request: Request
  ) => boolean,
  bodyHandler: SignedJSONHandler<T, B>
): Responder<T> {
  return (context, request) =>
    bodyHandler(
      context,
      resolveBuffer(request.request).then((buffer) => {
        const json = JSON.parse(buffer.toString("utf8"));
        const sig = signature(context, request);
        if (sig == null) {
          return ["unsigned", json];
        }

        if (verifySignature(sig, buffer, request)) {
          return ["signed", json];
        }
        throw new Error("Invalid signature");
      }),
      request
    );
}

export function checkSignature(
  buffer: Buffer,
  secret: string,
  signature: string
): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(buffer);
  const digest = hmac.digest("base64");
  return signature == digest;
}

export function context<R extends Record<string, unknown>>(matchers: {
  [K in keyof R]: Route<R[K]>;
}): Route<R> {
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
  };
}

/**
 * Returns a single request header value.
 */
export function requestHeader(headerNames: string[], defaultValue?: string) {
  return (request: Request): void | string => {
    for (const header of headerNames) {
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
  };
}

/**
 * Request content type header.
 */
export const contentType = requestHeader(["content-type"]);

export function prefix<S extends string>(pathPrefix: S): Route<S> {
  return (request) =>
    request.url?.startsWith(pathPrefix)
      ? success(pathPrefix)
      : failure(request, `URL does not begin with ${pathPrefix}`);
}

export function withPrefix<T extends string>(handler: Handler): Responder<T> {
  return async (context, request) => {
    const prefixed: Request = {
      ...request,
      url: request.url.slice(context.length),
    };
    const result = mapFailure(await handler(prefixed), (failure) =>
      success(
        jsonResponse(404, {}, { status: "not-found", reason: failure.reason })
      )
    );
    return result.value;
  };
}

export function routeNamespace<S extends string>(
  pathPrefix: S,
  handler: Handler
): Handler {
  return route(prefix(pathPrefix), withPrefix(handler));
}
