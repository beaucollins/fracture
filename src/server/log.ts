import { Endpoint } from '.';

export default function log(label: string, handler: Endpoint): Endpoint {
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
