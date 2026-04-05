import type { ValidationDetail } from "../types/index.js";
import type { RolUsuario } from "../types/index.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizeFullName(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function validateEmail(email: string, errors: ValidationDetail[]): void {
  if (!email) {
    errors.push({
      campo: "email",
      mensaje: "El email es obligatorio",
    });
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    errors.push({
      campo: "email",
      mensaje: "El email no es valido",
    });
  }
}

function validatePassword(password: string, errors: ValidationDetail[]): void {
  if (!password) {
    errors.push({
      campo: "password",
      mensaje: "La password es obligatoria",
    });
    return;
  }

  if (password.length < 6 || password.length > 72) {
    errors.push({
      campo: "password",
      mensaje: "La password debe tener entre 6 y 72 caracteres",
    });
  }
}

export function validateRegisterAuth(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  const nombreCompleto = normalizeFullName(body.nombre_completo);
  if (!nombreCompleto) {
    errors.push({
      campo: "nombre_completo",
      mensaje: "El nombre completo es obligatorio",
    });
  } else if (nombreCompleto.length < 3 || nombreCompleto.length > 120) {
    errors.push({
      campo: "nombre_completo",
      mensaje: "El nombre completo debe tener entre 3 y 120 caracteres",
    });
  }

  validateEmail(normalizeEmail(body.email), errors);
  validatePassword(String(body.password || ""), errors);

  return errors;
}

export function validateLoginAuth(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];

  validateEmail(normalizeEmail(body.email), errors);
  validatePassword(String(body.password || ""), errors);

  return errors;
}

export function validatePasswordResetRequest(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];
  validateEmail(normalizeEmail(body.email), errors);
  return errors;
}

function normalizeRole(value: unknown): RolUsuario | null {
  const role = String(value || "")
    .trim()
    .toUpperCase();

  if (role === "USUARIO" || role === "ORGANIZADOR" || role === "ADMIN") {
    return role;
  }

  return null;
}

export function validateRoleUpdateAuth(
  body: Record<string, unknown>,
): ValidationDetail[] {
  const errors: ValidationDetail[] = [];
  const role = normalizeRole(body.role);

  if (!role) {
    errors.push({
      campo: "role",
      mensaje: "El rol debe ser USUARIO, ORGANIZADOR o ADMIN",
    });
  }

  return errors;
}
