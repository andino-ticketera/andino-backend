export function isMissingColumnError(
  error: unknown,
  columnName: string,
): boolean {
  const dbError = error as { code?: string; message?: string };
  return (
    dbError?.code === "42703" &&
    String(dbError.message || "")
      .toLowerCase()
      .includes(columnName.trim().toLowerCase())
  );
}
