export type ApplicationErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVICE_UNAVAILABLE';

export type ApplicationErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 503;

export class ApplicationError extends Error {
  readonly name = 'ApplicationError';

  constructor(
    readonly code: ApplicationErrorCode,
    readonly status: ApplicationErrorStatus,
    readonly publicMessage: string,
    options?: ErrorOptions
  ) {
    super(publicMessage, options);
  }
}

export function invalidRequest(message: string, options?: ErrorOptions): ApplicationError {
  return new ApplicationError('INVALID_REQUEST', 400, message, options);
}

export function unauthorized(message: string, options?: ErrorOptions): ApplicationError {
  return new ApplicationError('UNAUTHORIZED', 401, message, options);
}

export function forbidden(message: string, options?: ErrorOptions): ApplicationError {
  return new ApplicationError('FORBIDDEN', 403, message, options);
}

export function notFound(message: string, options?: ErrorOptions): ApplicationError {
  return new ApplicationError('NOT_FOUND', 404, message, options);
}

export function conflict(message: string, options?: ErrorOptions): ApplicationError {
  return new ApplicationError('CONFLICT', 409, message, options);
}

export function payloadTooLarge(message: string, options?: ErrorOptions): ApplicationError {
  return new ApplicationError('PAYLOAD_TOO_LARGE', 413, message, options);
}

export function serviceUnavailable(message: string, options?: ErrorOptions): ApplicationError {
  return new ApplicationError('SERVICE_UNAVAILABLE', 503, message, options);
}
