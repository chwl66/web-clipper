import { IBasicRequestService } from '@/service/common/request';
import { RequestHelper } from '@/service/request/common/request';
import { UploadImageRequest, ImageHostingService } from '../interface';
import { Base64ImageToBlob } from '@/common/blob';
import { generateUuid } from '@web-clipper/shared/lib/uuid';
import md5 from '@web-clipper/shared/lib/md5';
import Container from 'typedi';
import { encodeS3Key, sha256Hex, signS3Request } from './sigv4';

export interface S3ImageHostingOption {
  /** 服务地址，例如 https://s3.us-east-1.amazonaws.com 或 https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  /** 区域，AWS 用 us-east-1 这类值，Cloudflare R2 用 auto */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 对象前缀（目录），例如 web-clipper，可留空 */
  pathPrefix?: string;
  /** 自定义访问域名（CDN / 公共读域名），留空则拼 endpoint */
  publicUrl?: string;
  /** MinIO 等自建服务通常需要 path-style 地址 */
  forcePathStyle?: boolean;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

function getExtension(mimeType?: string, fallback = 'png') {
  return MIME_EXTENSIONS[(mimeType || '').toLowerCase()] || fallback;
}

function normalizeEndpoint(endpoint?: string) {
  const trimmed = (endpoint || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizePrefix(prefix?: string) {
  const trimmed = (prefix || '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

export default class S3ImageHostingService implements ImageHostingService {
  private config: S3ImageHostingOption;

  constructor(config: S3ImageHostingOption) {
    this.config = {
      endpoint: normalizeEndpoint(config?.endpoint),
      region: (config?.region || '').trim(),
      bucket: (config?.bucket || '').trim(),
      accessKeyId: (config?.accessKeyId || '').trim(),
      secretAccessKey: (config?.secretAccessKey || '').trim(),
      pathPrefix: normalizePrefix(config?.pathPrefix),
      publicUrl: (config?.publicUrl || '').trim().replace(/\/+$/, ''),
      forcePathStyle: config?.forcePathStyle !== false,
    };
  }

  getId = () => {
    return md5(`${this.config.endpoint}|${this.config.bucket}`);
  };

  uploadImage = async ({ data }: UploadImageRequest) => {
    const blob = Base64ImageToBlob(data);
    return this.uploadBlob(blob);
  };

  uploadImageUrl = async (url: string) => {
    const blob = await Container.get(IBasicRequestService).download(url);
    return this.uploadBlob(blob);
  };

  private buildKey(blob: Blob) {
    const date = new Date();
    const folder = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');
    return `${this.config.pathPrefix}${folder}/${generateUuid()}.${getExtension(blob.type)}`;
  }

  private buildObjectUrl(key: string) {
    // key 先按 AWS 规则编码，保证实际请求路径与签名用的 canonical URI 一致
    const encodedKey = encodeS3Key(key);
    const url = new URL(this.config.endpoint);
    if (this.config.forcePathStyle) {
      return `${url.origin}/${this.config.bucket}/${encodedKey}`;
    }
    return `${url.protocol}//${this.config.bucket}.${url.host}/${encodedKey}`;
  }

  private buildPublicUrl(key: string) {
    const encodedKey = encodeS3Key(key);
    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${encodedKey}`;
    }
    return this.buildObjectUrl(key);
  }

  private ensureConfig() {
    if (
      !this.config.endpoint ||
      !this.config.region ||
      !this.config.bucket ||
      !this.config.accessKeyId ||
      !this.config.secretAccessKey
    ) {
      throw new Error('S3 bucket is not configured properly, please check endpoint / region / bucket / keys.');
    }
  }

  private uploadBlob = async (blob: Blob): Promise<string> => {
    this.ensureConfig();
    const key = this.buildKey(blob);
    const url = this.buildObjectUrl(key);
    const payloadHash = await sha256Hex(await blob.arrayBuffer());
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
        data: blob,
        // text 让 umi-request 原样使用 body（默认 json 会把 Blob 序列化成 "{}"）
        requestType: 'text',
        headers: {
          ...signedHeaders,
          'Content-Type': blob.type || 'application/octet-stream',
        },
      });
    } catch (error) {
      throw new Error(this.describeError(error));
    }

    return this.buildPublicUrl(key);
  };

  private describeError(error: any): string {
    const response = error?.response || {};
    const status: number | undefined = response.status;
    const body: string = typeof response.data === 'string' ? response.data : '';
    if (status === 403) {
      return 'S3 upload failed (403): please check the access key / secret key and the bucket policy.';
    }
    if (!status) {
      return 'S3 upload failed: request was blocked, please add this endpoint to the bucket CORS configuration.';
    }
    const detail = body.replace(/\s+/g, ' ').slice(0, 200);
    return `S3 upload failed (${status})${detail ? `: ${detail}` : ''}`;
  }
}
