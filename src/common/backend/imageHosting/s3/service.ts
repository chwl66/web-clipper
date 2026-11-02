import { IBasicRequestService } from '@/service/common/request';
import { UploadImageRequest, ImageHostingService } from '../interface';
import { Base64ImageToBlob } from '@/common/blob';
import { generateUuid } from '@web-clipper/shared/lib/uuid';
import md5 from '@web-clipper/shared/lib/md5';
import Container from 'typedi';
import { normalizePrefix, S3Client } from '../../s3/client';

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

export default class S3ImageHostingService implements ImageHostingService {
  private client: S3Client;
  private pathPrefix: string;
  private publicUrl: string;

  constructor(config: S3ImageHostingOption) {
    this.client = new S3Client(config);
    this.pathPrefix = normalizePrefix(config?.pathPrefix);
    this.publicUrl = (config?.publicUrl || '').trim();
  }

  getId = () => {
    return md5(`${this.client.endpoint}|${this.client.bucket}`);
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
    return `${this.pathPrefix}${folder}/${generateUuid()}.${getExtension(blob.type)}`;
  }

  private uploadBlob = async (blob: Blob): Promise<string> => {
    const key = this.buildKey(blob);
    await this.client.putObject(key, blob, blob.type || 'application/octet-stream');
    return this.client.buildPublicUrl(key, this.publicUrl);
  };
}
