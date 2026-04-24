import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { AppError } from "../../src/utils/errors.js";

const mocks = vi.hoisted(() => {
  const listUsersMock = vi.fn();
  const getUserByIdMock = vi.fn();
  const updateUserByIdMock = vi.fn();
  const deleteUserMock = vi.fn();
  const generateLinkMock = vi.fn();
  const signUpMock = vi.fn();
  const resetPasswordForEmailMock = vi.fn();
  const sendPasswordRecoveryEmailMock = vi.fn();
  const sendSignupConfirmationEmailMock = vi.fn();

  return {
    listUsersMock,
    getUserByIdMock,
    updateUserByIdMock,
    deleteUserMock,
    generateLinkMock,
    signUpMock,
    resetPasswordForEmailMock,
    sendPasswordRecoveryEmailMock,
    sendSignupConfirmationEmailMock,
  };
});

vi.mock("../../src/services/mail.service.js", () => ({
  sendPasswordRecoveryEmail: mocks.sendPasswordRecoveryEmailMock,
  sendSignupConfirmationEmail: mocks.sendSignupConfirmationEmailMock,
}));

vi.mock("../../src/services/supabase.client.js", () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        listUsers: mocks.listUsersMock,
        getUserById: mocks.getUserByIdMock,
        updateUserById: mocks.updateUserByIdMock,
        deleteUser: mocks.deleteUserMock,
        generateLink: mocks.generateLinkMock,
      },
    },
  }),
  getSupabaseAnonClient: () => ({
    auth: {
      signUp: mocks.signUpMock,
      signInWithPassword: vi.fn(),
      getUser: vi.fn(),
      resetPasswordForEmail: mocks.resetPasswordForEmailMock,
    },
  }),
}));

import {
  listRegisteredUsers,
  registerUser,
  sendPasswordResetEmail,
  updateUserRole,
} from "../../src/services/auth.service.js";

function buildSupabaseUser(input: {
  id: string;
  email: string;
  role?: "USUARIO" | "ORGANIZADOR" | "ADMIN";
  nombreCompleto?: string;
  createdAt?: string;
  lastSignInAt?: string | null;
  emailConfirmedAt?: string | null;
}) {
  return {
    id: input.id,
    email: input.email,
    app_metadata: {
      app_role: input.role ?? "USUARIO",
    },
    user_metadata: {
      nombre_completo: input.nombreCompleto ?? "Usuario Demo",
    },
    created_at: input.createdAt ?? "2026-04-01T10:00:00.000Z",
    last_sign_in_at: input.lastSignInAt ?? null,
    email_confirmed_at: input.emailConfirmedAt ?? null,
  };
}

describe("auth.service", () => {
  const mutableEnv = env as {
    resendApiKey: string;
    resendFromEmail: string;
    supabaseEmailConfirmRedirectTo: string;
  };
  const originalResendApiKey = env.resendApiKey;
  const originalResendFromEmail = env.resendFromEmail;
  const originalEmailConfirmRedirectTo = env.supabaseEmailConfirmRedirectTo;

  beforeEach(() => {
    vi.clearAllMocks();
    mutableEnv.resendApiKey = originalResendApiKey;
    mutableEnv.resendFromEmail = originalResendFromEmail;
    mutableEnv.supabaseEmailConfirmRedirectTo = originalEmailConfirmRedirectTo;
  });

  it("lista usuarios registrados ordenados por fecha de alta descendente", async () => {
    mocks.listUsersMock
      .mockResolvedValueOnce({
        data: {
          users: [
            buildSupabaseUser({
              id: "u-1",
              email: "uno@example.com",
              role: "USUARIO",
              nombreCompleto: "Uno",
              createdAt: "2026-03-20T10:00:00.000Z",
            }),
            buildSupabaseUser({
              id: "u-2",
              email: "dos@example.com",
              role: "ORGANIZADOR",
              nombreCompleto: "Dos",
              createdAt: "2026-04-01T10:00:00.000Z",
              lastSignInAt: "2026-04-02T08:00:00.000Z",
              emailConfirmedAt: "2026-04-01T10:05:00.000Z",
            }),
          ],
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { users: [] }, error: null });

    const result = await listRegisteredUsers();

    expect(mocks.listUsersMock).toHaveBeenCalledWith({ page: 1, perPage: 200 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "u-2",
      email: "dos@example.com",
      rol: "ORGANIZADOR",
      emailConfirmado: true,
      lastSignInAt: "2026-04-02T08:00:00.000Z",
    });
    expect(result[1]).toMatchObject({
      id: "u-1",
      rol: "USUARIO",
    });
  });

  it("falla si el admin intenta cambiar su propio rol", async () => {
    await expect(
      updateUserRole("same-user", "same-user", "ORGANIZADOR"),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      updateUserRole("same-user", "same-user", "ORGANIZADOR"),
    ).rejects.toMatchObject({
      status: 400,
      error: "ROL_OPERACION_INVALIDA",
    });
  });

  it("actualiza rol del usuario objetivo y devuelve usuario publico actualizado", async () => {
    mocks.getUserByIdMock
      .mockResolvedValueOnce({
        data: {
          user: buildSupabaseUser({
            id: "user-2",
            email: "organizador@example.com",
            role: "USUARIO",
            nombreCompleto: "Organizador Demo",
          }),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user: buildSupabaseUser({
            id: "user-2",
            email: "organizador@example.com",
            role: "ORGANIZADOR",
            nombreCompleto: "Organizador Demo",
          }),
        },
        error: null,
      });

    mocks.updateUserByIdMock.mockResolvedValueOnce({ error: null });

    const result = await updateUserRole("admin-1", "user-2", "ORGANIZADOR");

    expect(mocks.updateUserByIdMock).toHaveBeenCalledWith("user-2", {
      app_metadata: {
        app_role: "ORGANIZADOR",
      },
    });
    expect(result).toMatchObject({
      id: "user-2",
      email: "organizador@example.com",
      rol: "ORGANIZADOR",
    });
  });

  it("registra usuarios con mail de confirmacion branded usando generateLink signup", async () => {
    mutableEnv.resendApiKey = "re_test_key";
    mutableEnv.resendFromEmail = "hola@andinotickets.com";

    mocks.generateLinkMock.mockResolvedValueOnce({
      data: {
        properties: {
          action_link: "https://example.com/verify?token=signup123",
        },
        user: {
          id: "signup-user-1",
          email: "nuevo@example.com",
          user_metadata: {
            nombre_completo: "Nuevo Usuario",
          },
          app_metadata: {},
        },
      },
      error: null,
    });
    mocks.updateUserByIdMock.mockResolvedValueOnce({ error: null });
    mocks.getUserByIdMock.mockResolvedValueOnce({
      data: {
        user: buildSupabaseUser({
          id: "signup-user-1",
          email: "nuevo@example.com",
          role: "USUARIO",
          nombreCompleto: "Nuevo Usuario",
        }),
      },
      error: null,
    });
    mocks.sendSignupConfirmationEmailMock.mockResolvedValueOnce(undefined);

    const result = await registerUser({
      nombreCompleto: "Nuevo Usuario",
      email: "nuevo@example.com",
      password: "secret123",
    });

    expect(mocks.generateLinkMock).toHaveBeenCalledWith({
      type: "signup",
      email: "nuevo@example.com",
      password: "secret123",
      options: {
        redirectTo: env.supabaseEmailConfirmRedirectTo,
        data: {
          nombre_completo: "Nuevo Usuario",
        },
      },
    });
    expect(mocks.sendSignupConfirmationEmailMock).toHaveBeenCalledWith({
      email: "nuevo@example.com",
      confirmUrl: "https://example.com/verify?token=signup123",
      fullName: "Nuevo Usuario",
    });
    expect(result).toMatchObject({
      token: null,
      requiresEmailVerification: true,
      user: {
        id: "signup-user-1",
        email: "nuevo@example.com",
        rol: "USUARIO",
      },
    });
    expect(mocks.signUpMock).not.toHaveBeenCalled();
  });

  it("usa el flujo nativo de Supabase si el proveedor de email branded no esta configurado", async () => {
    mutableEnv.resendApiKey = "";

    mocks.signUpMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "signup-user-2",
          email: "fallback@example.com",
          user_metadata: {
            nombre_completo: "Fallback User",
          },
          app_metadata: {},
        },
        session: null,
      },
      error: null,
    });
    mocks.updateUserByIdMock.mockResolvedValueOnce({ error: null });
    mocks.getUserByIdMock.mockResolvedValueOnce({
      data: {
        user: buildSupabaseUser({
          id: "signup-user-2",
          email: "fallback@example.com",
          role: "USUARIO",
          nombreCompleto: "Fallback User",
        }),
      },
      error: null,
    });

    const result = await registerUser({
      nombreCompleto: "Fallback User",
      email: "fallback@example.com",
      password: "secret123",
    });

    expect(mocks.signUpMock).toHaveBeenCalledWith({
      email: "fallback@example.com",
      password: "secret123",
      options: {
        emailRedirectTo: env.supabaseEmailConfirmRedirectTo,
        data: {
          nombre_completo: "Fallback User",
        },
      },
    });
    expect(mocks.generateLinkMock).not.toHaveBeenCalled();
    expect(mocks.sendSignupConfirmationEmailMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      token: null,
      requiresEmailVerification: true,
      user: {
        id: "signup-user-2",
        email: "fallback@example.com",
      },
    });
  });

  it("envia el mail de recuperacion branded usando un link generado por Supabase Admin", async () => {
    mocks.generateLinkMock.mockResolvedValueOnce({
      data: {
        properties: {
          action_link: "https://example.com/reset?token=abc123",
        },
      },
      error: null,
    });
    mocks.sendPasswordRecoveryEmailMock.mockResolvedValueOnce(undefined);

    await sendPasswordResetEmail("user@example.com");

    expect(mocks.generateLinkMock).toHaveBeenCalledWith({
      type: "recovery",
      email: "user@example.com",
      options: {
        redirectTo: env.supabasePasswordResetRedirectTo,
      },
    });
    expect(mocks.sendPasswordRecoveryEmailMock).toHaveBeenCalledWith({
      email: "user@example.com",
      resetUrl: "https://example.com/reset?token=abc123",
    });
    expect(mocks.resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("vuelve al mail nativo de Supabase si el mail branded no esta configurado", async () => {
    mocks.generateLinkMock.mockResolvedValueOnce({
      data: {
        properties: {
          action_link: "https://example.com/reset?token=abc123",
        },
      },
      error: null,
    });
    mocks.sendPasswordRecoveryEmailMock.mockRejectedValueOnce(
      new AppError(
        503,
        "EMAIL_NO_CONFIGURADO",
        "El servicio de email no esta configurado",
      ),
    );
    mocks.resetPasswordForEmailMock.mockResolvedValueOnce({ error: null });

    await sendPasswordResetEmail("user@example.com");

    expect(mocks.resetPasswordForEmailMock).toHaveBeenCalledWith(
      "user@example.com",
      {
        redirectTo: env.supabasePasswordResetRedirectTo,
      },
    );
  });

  it("no revela si el email no existe", async () => {
    mocks.generateLinkMock.mockResolvedValueOnce({
      data: {
        properties: null,
      },
      error: {
        message: "User not found",
      },
    });

    await expect(sendPasswordResetEmail("ghost@example.com")).resolves.toBe(
      undefined,
    );

    expect(mocks.sendPasswordRecoveryEmailMock).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmailMock).not.toHaveBeenCalled();
  });
});
