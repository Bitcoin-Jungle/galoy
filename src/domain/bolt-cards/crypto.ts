import crypto from 'crypto';
import { aesCmac } from 'node-aes-cmac';

// SV2 constant from the Python implementation
const SV2 = "3CC300010080";

/**
 * Decrypts the P parameter from a bolt card tap using the SUN (Secure Unique NFC Message) 
 * technology as implemented in the NXP NTAG 424 DNA card
 * 
 * @param encryptedData - Buffer of encrypted data from card (P parameter)
 * @param key - Buffer of k1 key (SDM Meta Read Access Key)
 * @returns - Tuple of [cardUid, counter] where cardUid is a Buffer and counter is a Buffer
 */
export const decrypt_sun = (encryptedData: Buffer, key: Buffer): [Buffer, Buffer] => {
    if (encryptedData.length !== 16) {
      throw new Error('Invalid encrypted data length, must be 16 bytes');
    }
    
    if (key.length !== 16) {
      throw new Error('Invalid key length, must be 16 bytes');
    }
  
    // Create a zero IV for CBC mode
    const iv = Buffer.alloc(16, 0);
    
    // Create a decipher using CBC mode with zero IV
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    
    // Decrypt the data
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    // Extract UID: bytes 1-8 (7 bytes) as per spec
    const cardUid = decrypted.slice(1, 8);
    
    // Extract counter: bytes 8-11 (3 bytes) as per spec
    const counter = decrypted.slice(8, 11);
    
    return [cardUid, counter];
};

/**
 * Computes CMAC for the given key and message
 * 
 * @param key - Buffer containing the key
 * @param msg - Buffer containing the message (optional)
 * @returns - Buffer containing the CMAC
 */
const my_cmac = (key: Buffer, msg: Buffer = Buffer.alloc(0)): Buffer => {
    // Compute the CMAC using the node-aes-cmac package, which returns a hex string.
    const macHex = aesCmac(key, msg);
    return Buffer.from(macHex, 'hex');
  };
  
  /**
   * Computes the MAC for verification of a bolt card tap using the SUN (Secure Unique NFC Message)
   * technology as implemented in the NXP NTAG 424 DNA card
   * 
   * @param cardUid - Buffer containing the card UID (7 bytes)
   * @param counter - Buffer containing the counter value (at least 3 bytes)
   * @param key - Buffer containing the k2 key (SDM File Read Access Key, 16 bytes)
   * @returns - Buffer containing the MAC (8 bytes)
   */
  export const get_sun_mac = (cardUid: Buffer, counter: Buffer, key: Buffer): Buffer => {
    if (cardUid.length !== 7) {
      throw new Error('Invalid card UID length, must be 7 bytes');
    }
    
    if (key.length !== 16) {
      throw new Error('Invalid key length, must be 16 bytes');
    }
    
    // Use only 3 bytes of counter as in the specification
    const counterBytes = counter.slice(0, 3);
    
    // Prepare SV2 prefix + UID + counter
    const sv2prefix = Buffer.from(SV2, 'hex');
    const sv2bytes = Buffer.concat([sv2prefix, cardUid, counterBytes]);
    
    // Compute MAC using CMAC (matching the specification)
    const mac1 = my_cmac(key, sv2bytes);
    
    const mac2 = my_cmac(mac1);
    
    // Extract every other byte starting from index 1 (matching the specification)
    const result = Buffer.alloc(8);
    for (let i = 0; i < 8; i++) {
      result[i] = mac2[1 + i * 2];
    }
    
    return result;
};