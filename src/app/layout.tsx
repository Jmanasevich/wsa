import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' });

export const metadata = {
  title: 'CWG-IA — Inteligencia Comercial Vitivinícola | ALB Consultores',
  description: 'Agente de inteligencia de mercados para viñas chilenas exportadoras: radar de oportunidades, deep-dive, evaluación de deals y defensa competitiva.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={montserrat.variable}>
      <body className="font-sans antialiased bg-alb-light text-alb-text min-h-screen flex flex-col">
        {children}
        <footer className="mt-auto py-4 text-center text-xs text-alb-mid">
          © {new Date().getFullYear()} ALB Consultores SpA — CWG-IA
        </footer>
      </body>
    </html>
  );
}
