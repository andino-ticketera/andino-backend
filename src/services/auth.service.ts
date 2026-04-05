import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import type {
  AuthUser,
  AuthResponse,
  RolUsuario,
  UsuarioAdmin,
  UsuarioPublico,
} from "../types/index.js";
import { normalizeRole } from "./auth-role.js";
import {
  getSupabaseAdminClient,
  getSupabaseAnonClient,
} from "./supabase.client.js";
import type { User } from "@supabase/supabase-js";

function resolveRole(user: User): RolUsuario {
  const fromAppRole = normalizeRole(user.app_metadata?.app_role);
  if (fromAppRole) return fromAppRole;

  const fromAppGenericRole = normalizeRole(user.app_metadata?.role);
  if (fromAppGenericRole) return fromAppGenericRole;

  const fromUserMetadataRole = normalizeRole(user.user_metadata?.role);
  if (fromUserMetadataRole) return fromUserMetadataRole;

  return "USUARIO";
}

function resolveNombreCompleto(user: User): string {
  const fromNombreCompleto = String(
    user.user_metadata?.nombre_completo || "",
  ).trim();
  if (fromNombreCompleto) return fromNombreCompleto;

  const fromFullName = String(user.user_metadata?.full_name || "").trim();
  if (fromFullName) return fromFullName;

  const fromName = String(user.user_metadata?.name || "").trim();
  if (fromName) return fromName;

  const emailFallback = String(user.email || "").trim();
  return emailFallback || "Usuario";
}

function resolveEmail(user: User): string {
  const email = String(user.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    throw new AppError(
      500,
      "AUTH_INVALID_RESPONSE",
      "El usuario no tiene email asociado",
    );
  }

  return email;
}

function toUsuarioPublico(user: User): UsuarioPublico {
  return {
    id: user.id,
    nombreCompleto: resolveNombreCompleto(user),
    email: resolveEmail(user),
    rol: resolveRole(user),
  };
}

function toUsuarioAdmin(user: User): UsuarioAdmin {
  const base = toUsuarioPublico(user);

  return {
    ...base,
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    emailConfirmado: Boolean(user.email_confirmed_at),
  };
}

function mapAuthError(errMessage: string): AppError | null {
  const message = errMessage.toLowerCase();

  if (
    message.includes("invalid login credentials") ||
    message.includes("email or password")
  ) {
    return new AppError(
      401,
      "CREDENCIALES_INVALIDAS",
      "Email o password incorrectos",
    );
  }

  if (message.includes("email not confirmed")) {
    return new AppError(
      401,
      "EMAIL_NO_VERIFICADO",
      "Debe verificar su email antes de iniciar sesion",
    );
  }

  if (message.includes("user already registered")) {
    return new AppError(
      409,
      "EMAIL_YA_REGISTRADO",
      "Ya existe una cuenta con ese email",
    );
  }

  return null;
}

export async function registerUser(input: {
  nombreCompleto: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const supabase = getSupabaseAnonClient();
  const admin = getSupabaseAdminClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        nombre_completo: input.nombreCompleto,
      },
    },
  });

  if (error) {
    const mapped = mapAuthError(error.message);
    if (mapped) throw mapped;
    throw new AppError(
      400,
      "AUTH_REGISTER_ERROR",
      error.message || "No se pudo registrar el usuario",
    );
  }

  const createdUser = data.user;
  if (!createdUser) {
    throw new AppError(
      500,
      "AUTH_INVALID_RESPONSE",
      "Respuesta invalida al registrar usuario",
    );
  }

  const { error: updateRoleError } = await admin.auth.admin.updateUserById(
    createdUser.id,
    {
      app_metadata: {
        app_role: "USUARIO",
      },
      user_metadata: {
        ...(createdUser.user_metadata || {}),
        nombre_completo: input.nombreCompleto,
      },
    },
  );

  if (updateRoleError) {
    throw new AppError(
      500,
      "AUTH_ROLE_ASSIGN_ERROR",
      "No se pudo asignar el rol inicial del usuario",
    );
  }

  const { data: refreshedUserData, error: refreshedUserError } =
    await admin.auth.admin.getUserById(createdUser.id);

  if (refreshedUserError || !refreshedUserData?.user) {
    throw new AppError(
      500,
      "AUTH_INVALID_RESPONSE",
      "No se pudo leer el usuario registrado",
    );
  }

  const user = toUsuarioPublico(refreshedUserData.user);
  const token = data.session?.access_token || null;

  return {
    token,
    user,
    requiresEmailVerification: token === null,
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const supabase = getSupabaseAnonClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    const mapped = mapAuthError(error.message);
    if (mapped) throw mapped;
    throw new AppError(
      401,
      "CREDENCIALES_INVALIDAS",
      "Email o password incorrectos",
    );
  }

  if (!data.user || !data.session?.access_token) {
    throw new AppError(
      500,
      "AUTH_INVALID_RESPONSE",
      "Respuesta invalida al iniciar sesion",
    );
  }

  return {
    token: data.session.access_token,
    user: toUsuarioPublico(data.user),
  };
}

export async function getAuthUserFromToken(token: string): Promise<AuthUser> {
  const supabase = getSupabaseAnonClient();

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new AppError(401, "NO_AUTENTICADO", "Debe iniciar sesion");
  }

  return {
    id: data.user.id,
    role: resolveRole(data.user),
  };
}

/**
 * Para usuarios OAuth (Google, etc): si no tienen `app_role` en app_metadata,
 * lo asigna como "USUARIO" y persiste nombre completo desde user_metadata.
 * Devuelve el usuario publico actualizado.
 */
export async function ensureOAuthUserRole(
  token: string,
): Promise<UsuarioPublico> {
  const supabase = getSupabaseAnonClient();
  const admin = getSupabaseAdminClient();

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new AppError(401, "NO_AUTENTICADO", "Debe iniciar sesion");
  }

  const user = data.user;
  const existingAppRole = normalizeRole(user.app_metadata?.app_role);

  if (!existingAppRole) {
    const nombreCompleto = resolveNombreCompleto(user);

    const { error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...(user.app_metadata || {}),
          app_role: "USUARIO",
        },
        user_metadata: {
          ...(user.user_metadata || {}),
          nombre_completo: nombreCompleto,
        },
      },
    );

    if (updateError) {
      throw new AppError(
        500,
        "AUTH_ROLE_ASSIGN_ERROR",
        "No se pudo asignar el rol inicial del usuario OAuth",
      );
    }

    const { data: refreshed, error: refreshError } =
      await admin.auth.admin.getUserById(user.id);

    if (refreshError || !refreshed?.user) {
      throw new AppError(
        500,
        "AUTH_INVALID_RESPONSE",
        "No se pudo leer el usuario OAuth actualizado",
      );
    }

    return toUsuarioPublico(refreshed.user);
  }

  return toUsuarioPublico(user);
}

export async function getCurrentUser(userId: string): Promise<UsuarioPublico> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new AppError(401, "NO_AUTENTICADO", "Debe iniciar sesion");
  }

  return toUsuarioPublico(data.user);
}

export async function getPublicUserById(
  userId: string,
): Promise<UsuarioPublico | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error || !data.user) {
    return null;
  }

  return toUsuarioPublico(data.user);
}

export async function getPublicUsersByIds(
  userIds: string[],
): Promise<Map<string, UsuarioPublico>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (userId) => {
      const user = await getPublicUserById(userId);
      return [userId, user] as const;
    }),
  );

  return new Map(
    entries.filter(
      (entry): entry is [string, UsuarioPublico] => entry[1] !== null,
    ),
  );
}

export async function listRegisteredUsers(): Promise<UsuarioAdmin[]> {
  const admin = getSupabaseAdminClient();
  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new AppError(
        500,
        "AUTH_USERS_LIST_ERROR",
        "No se pudieron listar los usuarios",
      );
    }

    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  const deduped = new Map<string, UsuarioAdmin>();

  for (const user of users) {
    try {
      const mapped = toUsuarioAdmin(user);
      deduped.set(mapped.id, mapped);
    } catch {
      // Ignore malformed users without essential public data.
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export async function updateUserRole(
  actorUserId: string,
  targetUserId: string,
  nextRole: RolUsuario,
): Promise<UsuarioPublico> {
  if (actorUserId === targetUserId) {
    throw new AppError(
      400,
      "ROL_OPERACION_INVALIDA",
      "No puede cambiar su propio rol desde esta accion",
    );
  }

  const admin = getSupabaseAdminClient();

  const { data: currentUserData, error: currentUserError } =
    await admin.auth.admin.getUserById(targetUserId);
  if (currentUserError || !currentUserData.user) {
    throw new AppError(
      404,
      "USUARIO_NO_ENCONTRADO",
      "No se encontro el usuario objetivo",
    );
  }

  const currentUser = currentUserData.user;
  const { error: updateError } = await admin.auth.admin.updateUserById(
    targetUserId,
    {
      app_metadata: {
        ...(currentUser.app_metadata || {}),
        app_role: nextRole,
      },
    },
  );

  if (updateError) {
    throw new AppError(
      500,
      "ROL_ACTUALIZACION_ERROR",
      "No se pudo actualizar el rol",
    );
  }

  const { data: updatedUserData, error: updatedUserError } =
    await admin.auth.admin.getUserById(targetUserId);
  if (updatedUserError || !updatedUserData.user) {
    throw new AppError(
      500,
      "AUTH_INVALID_RESPONSE",
      "No se pudo leer el usuario actualizado",
    );
  }

  return toUsuarioPublico(updatedUserData.user);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const supabase = getSupabaseAnonClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: env.supabasePasswordResetRedirectTo,
  });

  if (error) {
    const mapped = mapAuthError(error.message);
    if (mapped) {
      throw mapped;
    }

    throw new AppError(
      400,
      "PASSWORD_RESET_ERROR",
      "No se pudo enviar el email de recuperacion",
    );
  }
}
