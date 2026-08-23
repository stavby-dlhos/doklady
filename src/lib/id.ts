import { randomBytes } from "crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Krátke, zoraditeľné ID: časová pečiatka + náhodná časť. */
export function createId(): string {
  const time = Date.now().toString(36).padStart(9, "0");
  const rand = randomBytes(8)
    .toString("hex")
    .split("")
    .map((c) => ALPHABET[parseInt(c, 16)])
    .join("");
  return `${time}${rand}`;
}
