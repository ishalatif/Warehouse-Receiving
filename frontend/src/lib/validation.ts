const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Kumpulan pesan error per field form.
 */
export type FieldErrors = Record<string, string>;

/**
 * Mem-parse string menjadi bilangan bulat positif.
 *
 * @param value - Nilai string dari input form.
 * @returns Bilangan bulat positif, atau `null` jika tidak valid.
 */
export function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Memvalidasi input login.
 *
 * @param email - Email mentah dari form.
 * @param password - Password mentah dari form.
 * @returns Error per field; objek kosong berarti valid.
 */
export function validateLogin(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0) {
    errors.email = "Email wajib diisi.";
  } else if (trimmedEmail.length > 255 || !EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = "Format email tidak valid.";
  }

  if (password.length === 0) {
    errors.password = "Password wajib diisi.";
  }

  return errors;
}

/**
 * Memvalidasi input pembuatan produk.
 *
 * @param sku - SKU mentah dari form.
 * @param name - Nama produk mentah dari form.
 * @returns Error per field; objek kosong berarti valid.
 */
export function validateProductInput(sku: string, name: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedSku = sku.trim();
  const trimmedName = name.trim();

  if (trimmedSku.length === 0) {
    errors.sku = "SKU wajib diisi.";
  } else if (trimmedSku.length > 100) {
    errors.sku = "SKU maksimal 100 karakter.";
  }

  if (trimmedName.length === 0) {
    errors.name = "Nama produk wajib diisi.";
  } else if (trimmedName.length > 255) {
    errors.name = "Nama produk maksimal 255 karakter.";
  }

  return errors;
}

/**
 * Baris mentah item dokumen pada form.
 */
export interface DraftRowInput {
  product_id: string;
  expected_quantity: string;
}

/**
 * Memvalidasi form pembuatan dokumen penerimaan.
 *
 * @param documentNumber - Nomor dokumen mentah.
 * @param rows - Baris item mentah dari form.
 * @returns Error per field, termasuk `row-<index>` untuk item tidak valid.
 */
export function validateDocumentDraft(
  documentNumber: string,
  rows: DraftRowInput[],
): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedNumber = documentNumber.trim();

  if (trimmedNumber.length === 0) {
    errors.document_number = "Nomor dokumen wajib diisi.";
  } else if (trimmedNumber.length > 100) {
    errors.document_number = "Nomor dokumen maksimal 100 karakter.";
  }

  if (rows.length === 0) {
    errors.items = "Tambahkan minimal satu item.";
    return errors;
  }

  const seenProductIds = new Set<string>();

  rows.forEach((row, index) => {
    const productId = parsePositiveInteger(row.product_id);
    const expectedQuantity = parsePositiveInteger(row.expected_quantity);

    if (productId === null) {
      errors[`row-${index}`] = "Pilih produk yang valid.";
      return;
    }
    if (seenProductIds.has(String(productId))) {
      errors[`row-${index}`] = "Produk tidak boleh dipilih lebih dari sekali.";
      return;
    }
    seenProductIds.add(String(productId));

    if (expectedQuantity === null) {
      errors[`row-${index}`] = "Kuantitas harapan harus bilangan bulat positif.";
    }
  });

  return errors;
}

/**
 * Baris mentah penerimaan pada form.
 */
export interface ReceiveRowInput {
  product_id: number;
  remaining: number;
  quantity: string;
}

/**
 * Memvalidasi form penerimaan barang.
 *
 * Minimal satu baris harus diisi; setiap kuantitas harus bilangan bulat
 * positif dan tidak melebihi sisa kuantitas harapan.
 *
 * @param rows - Baris item dokumen yang dapat diterima.
 * @returns Error per field (`row-<index>` atau `items`).
 */
export function validateReceiveInput(rows: ReceiveRowInput[]): FieldErrors {
  const errors: FieldErrors = {};
  let filledRows = 0;

  rows.forEach((row, index) => {
    if (row.quantity.trim().length === 0) {
      return;
    }

    filledRows += 1;
    const quantity = parsePositiveInteger(row.quantity);
    if (quantity === null) {
      errors[`row-${index}`] = "Kuantitas harus bilangan bulat positif.";
      return;
    }
    if (quantity > row.remaining) {
      errors[`row-${index}`] = `Kuantitas melebihi sisa ${row.remaining}.`;
    }
  });

  if (filledRows === 0) {
    errors.items = "Isi minimal satu kuantitas penerimaan.";
  }

  return errors;
}
