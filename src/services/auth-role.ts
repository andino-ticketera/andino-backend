import type { RolUsuario } from "../types/index.js";

export function normalizeRole(rawRole: unknown): RolUsuario | null {
  const role = String(rawRole || "")
    .trim()
    .toUpperCase();

  if (role === "ORGANIZADOR" || role === "ADMIN" || role === "USUARIO") {
    return role;
  }

  if (role === "USER") return "USUARIO";

  return null;
}
