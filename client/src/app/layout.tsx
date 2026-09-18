import "./globals.css";

export const metadata = {
  title: "PixelForge Studio",
  description: "Pixel art editor for game creators",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
