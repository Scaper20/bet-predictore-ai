import { bet9ja } from "./bet9ja";
import { sportybet } from "./sportybet";
import { onexbet } from "./onexbet";
import { betking } from "./betking";
import type { BookmakerAdapter } from "./types";

export const BOOKMAKERS: BookmakerAdapter[] = [bet9ja, sportybet, onexbet, betking];

export function bookmakerById(id: string): BookmakerAdapter | undefined {
  return BOOKMAKERS.find((b) => b.id === id);
}

export * from "./types";
