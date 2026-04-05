import type { ValidationDetail } from '../types/index.js';

export class AppError extends Error {
  status: number;
  error: string;
  mensaje: string;
  detalles?: ValidationDetail[];

  constructor(status: number, error: string, mensaje: string, detalles?: ValidationDetail[]) {
    super(mensaje);
    this.status = status;
    this.error = error;
    this.mensaje = mensaje;
    if (detalles && detalles.length > 0) {
      this.detalles = detalles;
    }
  }
}

export function buildValidationError(detalles: ValidationDetail[]): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Hay errores de validacion en el request', detalles);
}
