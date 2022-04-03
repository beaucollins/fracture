import { ClientRequest } from "http";

export type RequestHandler<T> = (options: T, request: ClientRequest) => void;

export const emptyBody = <T>(_: T, req: ClientRequest): void => {
  req.end();
};

export function encodeChunkedJson<T>(
  encoder: (options: T) => unknown
): RequestHandler<T> {
  return function (options, req) {
    const data = Buffer.from(JSON.stringify(encoder(options)));
    const len = data.length.toString(16);
    req.write(`${len}\r\n${data}\r\n`);
    req.write("0\r\n");
    req.end();
  };
}

export function writeBuffer<T>(buffer: Buffer): RequestHandler<T> {
  return function (_, req) {
    req.write(buffer);
    req.end();
  };
}
