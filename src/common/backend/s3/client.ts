import { IBasicRequestService } from '@/service/common/request';
import { RequestHelper } from '@/service/request/common/request';
import Container from 'typedi';
import { encodeS3Key, sha256Hex, signS3Request } from './sigv4';

export interface S3ClientConfig {
  /** 服务地址，例如 https://s3.us-east-1.amazonaws.com 或 https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  /** 区域，AWS 用 us-east-1 这类值，Cloudflare R2 用 auto */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO 等自建服务通常需要 path-style 地址，默认 true */
  forcePathStyle?: boolean;
}

export function normalizeEndpoint(endpoint?: string) {
  const trimmed = (endpoint || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizePrefix(prefix?: string) {
  const trimmed = (prefix || '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

function describeError(error: any): string {
  const response = error?.response || {};
  const status: number | undefined = response.status;
  const body: string = typeof response.data === 'string' ? response.data : '';
  if (status === 403) {
    return 'S3 request failed (403): please check the access key / secret key and the bucket policy.';
  }
  if (!status) {
    return 'S3 request was blocked, please add this endpoint to the bucket CORS configuration.';
  }
  const detail = body.replace(/\s+/g, ' ').slice(0, 200);
  return `S3 request failed (${status})${detail ? `: ${detail}` : ''}`;
}

/**
 * 极简的 S3 客户端：只做需要的 PUT Object（以及地址拼装），签名走 SigV4
 */
export class S3Client {
  private config: S3ClientConfig & { endpoint: string };

  constructor(config: S3ClientConfig) {
    this.config = {
      endpoint: normalizeEndpoint(config?.endpoint),
      region: (config?.region || '').trim(),
      bucket: (config?.bucket || '').trim(),
      accessKeyId: (config?.accessKeyId || '').trim(),
      secretAccessKey: (config?.secretAccessKey || '').trim(),
      forcePathStyle: config?.forcePathStyle !== false,
    };
  }

  get bucket() {
    return this.config.bucket;
  }

  get endpoint() {
    return this.config.endpoint;
  }

  ensureConfig() {
    if (
      !this.config.endpoint ||
      !this.config.region ||
      !this.config.bucket ||
      !this.config.accessKeyId ||
      !this.config.secretAccessKey
    ) {
      throw new Error(
        'S3 is not configured properly, please check endpoint / region / bucket / access key / secret key.'
      );
    }
  }

  buildObjectUrl(key: string) {
    // key 先按 AWS 规则编码，保证实际请求路径与签名用的 canonical URI 一致
    const encodedKey = encodeS3Key(key);
    const url = new URL(this.config.endpoint);
    if (this.config.forcePathStyle) {
      return `${url.origin}/${this.config.bucket}/${encodedKey}`;
    }
    return `${url.protocol}//${this.config.bucket}.${url.host}/${encodedKey}`;
  }

  buildPublicUrl(key: string, publicUrl?: string) {
    const trimmed = (publicUrl || '').trim().replace(/\/+$/, '');
    if (trimmed) {
      return `${trimmed}/${encodeS3Key(key)}`;
    }
    return this.buildObjectUrl(key);
  }

  async putObject(key: string, body: Blob, contentType = 'application/octet-stream') {
    this.ensureConfig();
    const url = this.buildObjectUrl(key);
    const payloadHash = await sha256Hex(await body.arrayBuffer());
    const signedHeaders = await signS3Request({
      method: 'PUT',
      url,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      payloadHash,
    });

    const request = new RequestHelper({
      request: Container.get(IBasicRequestService),
    });

    try {
      await request.put(url, {
        data: body,
        // text 让 umi-request 原样使用 body（默认 json 会把 Blob 序列化成 "{}"）
        requestType: 'text',
        headers: {
          ...signedHeaders,
          'Content-Type': contentType,
        },
      });
    } catch (error) {
      throw new Error(describeError(error));
    }
  }
}
