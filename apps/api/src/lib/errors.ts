import type { FastifyReply } from 'fastify';
import type { ZodType } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    throw new AppError('VALIDATION_ERROR', message, 400, result.error.issues);
  }
  return result.data;
}

export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'internal error',
    },
  });
}

export function notFound(message = 'not found'): AppError {
  return new AppError('NOT_FOUND', message, 404);
}

export function disabled(message: string): AppError {
  return new AppError('DISABLED', message, 503);
}
