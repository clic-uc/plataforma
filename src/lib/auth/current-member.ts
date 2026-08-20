import type { MemberRole } from "@/generated/prisma/enums";

/**
 * Proyección del Member de la sesión: solo los campos necesarios para autorizar
 * y para renderizar el chrome.
 *
 * No es la fila completa por diseño. Este objeto cruza la frontera server/client
 * como prop del Sidebar, así que exponer el Member entero serializaría skills,
 * streak, birthday y timestamps hacia el bundle del navegador.
 */
export interface CurrentMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: MemberRole;
  isVerified: boolean;
}
