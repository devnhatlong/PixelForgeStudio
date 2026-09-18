import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata = {
  title: "PixelForge Studio",
  description: "Pixel art editor for game creators",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
