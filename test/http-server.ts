import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export function createAsyncServer(
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): Server {
  return createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
