import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VilaMarket | Vila Militar do Bacacheri',
  description: 'Minimercado Autônomo, Carteira Cashback e Classificados da Vila Militar',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 text-grafite antialiased">
        {children}
      </body>
    </html>
  );
}