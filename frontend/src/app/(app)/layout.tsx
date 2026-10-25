import { AppShell } from "@/components/AppShell";

/**
 * Layout halaman terautentikasi.
 *
 * @param props.children - Konten halaman.
 * @returns Shell dengan navigasi.
 */
export default function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
