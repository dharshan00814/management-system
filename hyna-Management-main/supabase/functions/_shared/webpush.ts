// ============================================================
// Hyna Management: Native Web Push & VAPID (RFC 8291 & RFC 8292)
// Built exclusively using the Web Crypto API for standard Deno/Edge runtime
// No proprietary Firebase SDK, zero external runtime dependencies
// ============================================================

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface SendPushResult {
  success: boolean;
  statusCode: number;
  isPermanentFailure: boolean; // 404 or 410 (Subscription expired/unsubscribed)
  error?: string;
}

// Helper: Base64URL to Uint8Array
export function base64UrlToUint8Array(base64UrlString: string): Uint8Array {
  const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper: Uint8Array to Base64URL string
export function uint8ArrayToBase64Url(uint8Array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper: Concatenate Uint8Arrays
function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Generate VAPID Authorization JWT Header
export async function createVapidHeaders(
  endpoint: string,
  vapid: VapidDetails
): Promise<{ Authorization: string }> {
  const parsedUrl = new URL(endpoint);
  const audience = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const now = Math.floor(Date.now() / 1000);

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: vapid.subject,
  };

  const encodedHeader = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const encodedPayload = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Import VAPID private key (PKCS8 / raw d value)
  const rawPrivateKey = base64UrlToUint8Array(vapid.privateKey);
  const rawPublicKey = base64UrlToUint8Array(vapid.publicKey);

  // Convert raw P-256 private and public keys to JWK format for SubtleCrypto
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: uint8ArrayToBase64Url(rawPublicKey.slice(1, 33)),
    y: uint8ArrayToBase64Url(rawPublicKey.slice(33, 65)),
    d: uint8ArrayToBase64Url(rawPrivateKey),
    ext: true,
  };

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    signingKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = uint8ArrayToBase64Url(new Uint8Array(signature));
  const jwt = `${unsignedToken}.${encodedSignature}`;

  return {
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
  };
}

// HKDF Helper
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    ikm as unknown as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      info: info as unknown as BufferSource,
    },
    key,
    length * 8
  );

  return new Uint8Array(bits);
}

// RFC 8291 (aes128gcm) Payload Encryption
export async function encryptPayload(
  subscription: PushSubscriptionPayload,
  payloadText: string
): Promise<Uint8Array> {
  const userPublicKeyBytes = base64UrlToUint8Array(subscription.keys.p256dh);
  const userAuthBytes = base64UrlToUint8Array(subscription.keys.auth);

  // 1. Generate ephemeral local ECDH keypair
  const localKeypair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', localKeypair.publicKey)
  );

  // 2. Import recipient's public key
  const recipientPublicKey = await crypto.subtle.importKey(
    'raw',
    userPublicKeyBytes as unknown as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // 3. Compute shared ECDH secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPublicKey },
    localKeypair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // 4. Derive pseudo-random key (PRK) using auth secret
  const authInfo = concatUint8Arrays(
    new TextEncoder().encode('WebPush: info\0'),
    userPublicKeyBytes,
    localPublicKeyRaw
  );
  const ikm = await hkdf(userAuthBytes, sharedSecret, authInfo, 32);

  // 5. Generate 16-byte random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 6. Derive CEK (16 bytes) and Nonce (12 bytes)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // 7. Prepare plaintext with padding delimiter (0x02 indicates last/single record)
  const payloadBytes = new TextEncoder().encode(payloadText);
  const paddedPlaintext = concatUint8Arrays(payloadBytes, new Uint8Array([2]));

  // 8. Encrypt using AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    'raw',
    cek as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as BufferSource, tagLength: 128 },
    aesKey,
    paddedPlaintext as unknown as BufferSource
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  // 9. Format binary body as per RFC 8291
  // Header: Salt (16B) || RecordSize (4B, big-endian) || IDLen (1B = 65) || LocalPublicKey (65B)
  const recordSize = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096 bytes
  const idLen = new Uint8Array([localPublicKeyRaw.length]);

  return concatUint8Arrays(salt, recordSize, idLen, localPublicKeyRaw, ciphertext);
}

// High-level: Send Encrypted Web Push to a Subscription
export async function sendWebPush(
  subscription: PushSubscriptionPayload,
  payload: Record<string, any>,
  vapid: VapidDetails,
  options: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {}
): Promise<SendPushResult> {
  try {
    const payloadString = JSON.stringify(payload);
    const encryptedBody = await encryptPayload(subscription, payloadString);
    const vapidHeaders = await createVapidHeaders(subscription.endpoint, vapid);

    const ttl = options.ttl ?? 86400; // 24 hours
    const urgency = options.urgency ?? 'normal';

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...vapidHeaders,
        'TTL': ttl.toString(),
        'Urgency': urgency,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
      },
      body: encryptedBody as unknown as BodyInit,
    });

    const isPermanent = response.status === 404 || response.status === 410;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        statusCode: response.status,
        isPermanentFailure: isPermanent,
        error: `Push service rejected with HTTP ${response.status}: ${errorText}`,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      isPermanentFailure: false,
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      isPermanentFailure: false,
      error: err?.message || 'Network error delivering push notification',
    };
  }
}
