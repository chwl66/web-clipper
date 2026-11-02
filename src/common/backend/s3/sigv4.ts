/**
 * AWS Signature Version 4（浏览器 WebCrypto 实现）
 * 仅覆盖本图床用到的 PUT Object 场景：无 query，签名 host / x-amz-content-sha256 / x-amz-date
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).padStart(2, '0');
  }
  return result;
}

/**
 * AWS 要求除 A-Z a-z 0-9 - _ . ~ 之外的字符都做百分号编码
 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

/**
 * 编码对象的 key（按 / 分段，保留目录分隔符）
 * 用于拼请求地址，保证实际请求的 path 与签名用的 canonical URI 完全一致。
 * 内部先解码再编码，因此对已编码的 key 也幂等
 */
export function encodeS3Key(key: string): string {
  return key
    .split('/')
    .map(segment => canonicalSegment(segment))
    .join('/');
}

/**
 * 规范化成 AWS 要求的「一次编码」形式：
 * 输入可能已经是编码过的 pathname，先解码再编码，保证幂等
 */
function canonicalSegment(segment: string): string {
  try {
    return encodeRfc3986(decodeURIComponent(segment));
  } catch (error) {
    return encodeRfc3986(segment);
  }
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const payload = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return toHex(digest);
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

export function getAmzDate(date: Date) {
  // 2026-11-02T11:20:00.000Z -> 20261102T112000Z
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate,
    dateStamp: amzDate.slice(0, 8),
  };
}

async function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

export interface SignS3RequestOptions {
  method: string;
  /** 完整对象地址，签名用的 host 与 path 都从它推导 */
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  service?: string;
  date?: Date;
}

/**
 * 返回需要附加到请求上的头（Authorization / x-amz-content-sha256 / x-amz-date）
 * 注意：浏览器不允许手动设置 Host，但签名里的 host 与浏览器实际发送的一致
 */
export async function signS3Request(options: SignS3RequestOptions): Promise<Record<string, string>> {
  const service = options.service || 's3';
  const url = new URL(options.url);
  const { amzDate, dateStamp } = getAmzDate(options.date || new Date());
  const credentialScope = `${dateStamp}/${options.region}/${service}/aws4_request`;

  const canonicalHeaders =
    `host:${url.host}\n` +
    `x-amz-content-sha256:${options.payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalUri = url.pathname
    .split('/')
    .map(segment => canonicalSegment(segment))
    .join('/');

  const canonicalRequest = [
    options.method.toUpperCase(),
    canonicalUri,
    '', // canonical query string：本场景不带 query
    canonicalHeaders,
    signedHeaders,
    options.payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSignatureKey(
    options.secretAccessKey,
    dateStamp,
    options.region,
    service
  );
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return {
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': options.payloadHash,
    'x-amz-date': amzDate,
  };
}
