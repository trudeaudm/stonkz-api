import type { FastifyReply } from 'fastify';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.status(statusCode).send({
    error: { code, message },
  });
}

export function toPublicError(err: unknown): {
  statusCode: number;
  code: string;
  message: string;
} {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message };
  }
  return {
    statusCode: 500,
    code: 'internal_error',
    message: 'Internal server error',
  };
}
