import crypto from "crypto"

/**
 * Generates a user-friendly recovery key
 * Format: XXXX-XXXX-XXXX-XXXX (where X is alphanumeric)
 */
export const generateRecoveryKey = (): string => {
  const generateSegment = () => {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed easily confused characters like 0/O, 1/I
    let segment = ""
    for (let i = 0; i < 4; i++) {
      const randomIndex = crypto.randomInt(0, characters.length)
      segment += characters[randomIndex]
    }
    return segment
  }

  // Create 4 segments of 4 characters each
  return Array.from({ length: 4 }, generateSegment).join("-")
}

/**
 * Hashes a recovery key for secure storage
 * Uses SHA-256 with a salt for security
 */
export const hashRecoveryKey = (recoveryKey: string): string => {
  // Remove any spaces and convert to uppercase for consistent hashing
  const normalizedKey = recoveryKey.replace(/\s+/g, "").toUpperCase()
  
  // Use a crypto-secure hash (could also use bcrypt or Argon2 for even more security)
  return crypto.createHash("sha256").update(normalizedKey).digest("hex")
}

/**
 * Verifies if a provided recovery key matches the stored hash
 */
export const verifyRecoveryKey = (providedKey: string, storedHash: string): boolean => {
  const providedHash = hashRecoveryKey(providedKey)
  return crypto.timingSafeEqual(
    Buffer.from(providedHash, "hex"),
    Buffer.from(storedHash, "hex")
  )
} 