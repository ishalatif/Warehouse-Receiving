import readline from "node:readline/promises";
import { closePool } from "../config/db";
import {
  createUserAccount,
  EmailAlreadyExistsError,
  UserValidationError,
  type UserRole,
} from "../services/user.service";

/**
 * Membaca satu baris input dari terminal.
 *
 * @param question - Teks pertanyaan yang ditampilkan.
 * @returns Nilai yang diketik pengguna (tanpa newline).
 */
async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/**
 * Membaca password dari terminal tanpa menampilkan karakternya.
 *
 * Implementasi memakai raw mode agar input tidak di-echo. Hanya didukung pada
 * terminal interaktif; password tidak pernah diterima dari argumen CLI.
 *
 * @param question - Teks pertanyaan yang ditampilkan.
 * @returns Password yang diketik pengguna.
 */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;

    if (!stdin.isTTY) {
      reject(new Error("Input password memerlukan terminal interaktif (TTY)."));
      return;
    }

    process.stdout.write(question);
    const previousRawMode = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";

    const cleanup = (): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(previousRawMode);
      stdin.pause();
    };

    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          process.exitCode = 130;
          reject(new Error("Dibatalkan."));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (char >= " ") {
          value += char;
          process.stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}

/**
 * Menjalankan alur pembuatan user secara interaktif.
 *
 * @returns Promise<void>
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Script ini menolak berjalan dengan NODE_ENV=production. Jalankan pada environment lokal.",
    );
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Script ini memerlukan terminal interaktif (TTY).");
  }

  const email = (await ask("Email: ")).trim();
  const roleInput = (await ask("Role (OPERATOR/SUPERVISOR): ")).trim().toUpperCase();
  const role = roleInput as UserRole;

  if (role !== "OPERATOR" && role !== "SUPERVISOR") {
    throw new UserValidationError("Role harus OPERATOR atau SUPERVISOR.");
  }

  const password = await askHidden("Password (minimal 12 karakter): ");
  if (password.length === 0) {
    throw new UserValidationError("Password wajib diisi.");
  }
  const confirmation = await askHidden("Ulangi password: ");
  if (password !== confirmation) {
    throw new UserValidationError("Konfirmasi password tidak sama.");
  }

  const user = await createUserAccount({ email, password, role });

  process.stdout.write(
    `User dibuat: ${user.email} (${user.role}), id=${user.id}.\n` +
      "Password tidak disimpan di mana pun selain hash di database.\n",
  );
}

void main()
  .catch((error: unknown) => {
    if (error instanceof UserValidationError || error instanceof EmailAlreadyExistsError) {
      console.error(error.message);
    } else if (error instanceof Error) {
      console.error(`Gagal membuat user: ${error.message}`);
    } else {
      console.error("Gagal membuat user.");
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
