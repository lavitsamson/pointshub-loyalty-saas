import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PROBLEM_JSON_CONTENT_TYPE, type ProblemDetails } from '@pointshub/shared';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { ProblemException } from './problem.exception';

/** Converts every thrown error into an RFC 9457 Problem Details response. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const problem = { ...this.toProblem(exception), instance: request.originalUrl };

    if (problem.status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(problem.status).type(PROBLEM_JSON_CONTENT_TYPE).json(problem);
  }

  toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ProblemException) {
      return exception.problem;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail: extractMessage(exception),
      };
    }

    // Never leak internals of unexpected errors to the client.
    return {
      type: 'about:blank',
      title: STATUS_CODES[HttpStatus.INTERNAL_SERVER_ERROR] ?? 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}

function extractMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return exception.message;
}
