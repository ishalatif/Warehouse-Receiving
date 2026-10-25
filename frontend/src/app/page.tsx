import { redirect } from "next/navigation";

/**
 * Halaman akar: arahkan pengguna ke katalog produk.
 *
 * @returns Tidak merender konten; melakukan redirect.
 */
export default function HomePage() {
  redirect("/products");
}
