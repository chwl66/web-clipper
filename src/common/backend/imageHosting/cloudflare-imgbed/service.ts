import { IBasicRequestService } from '@/service/common/request';
import { RequestHelper } from '@/service/request/common/request';
import { UploadImageRequest, ImageHostingService } from '../interface';
import { Base64ImageToBlob } from '@/common/blob';
import Container from 'typedi';
import md5 from '@web-clipper/shared/lib/md5';

export type CloudflareImgBedAuthType = 'token' | 'authCode' | 'none';

export interface CloudflareImgBedOption {
  /** 图床实例地址，例如 https://img.example.com */
  origin: string;
  /** token: API Token（Authorization: Bearer）；authCode: 访问码；none: 匿名上传 */
  authType: CloudflareImgBedAuthType;
  accessToken?: string;
  authCode?: string;
  /** telegram | cfr2 | s3 | discord | huggingface | webdav | external，留空走服务端默认 */
  uploadChannel?: string;
  /** 上传目录，留空则按图床设置 */
  uploadFolder?: string;
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

function normalizeOrigin(origin?: string) {
  return (origin || '').trim().replace(/\/+$/, '');
}

function getExtension(mimeType?: string, fallback = 'png') {
  return MIME_EXTENSIONS[(mimeType || '').toLowerCase()] || fallback;
}

function getFileNameFromUrl(url: string, blob: Blob) {
  try {
    const pathname = new URL(url).pathname;
    const baseName = decodeURIComponent(pathname.split('/').pop() || '');
    if (/\.[a-zA-Z0-9]{2,5}$/.test(baseName)) {
      return baseName;
    }
  } catch (error) {
    // ignore invalid url
  }
  return `web_clipper_${Date.now()}.${getExtension(blob.type)}`;
}

/**
 * CloudFlare-ImgBed 上传接口返回格式比较多：
 * - `[{ src: "/file/xxx.png", publicUrl?: "https://cdn/xxx.png" }]`（默认）
 * - `{ src: ... }`（responseFormat=object 或单文件）
 * - 纯文本 URL（部分老版本）
 */
export function resolveUploadUrl(result: any, origin: string): string {
  if (result === null || result === undefined) {
    throw new Error('Upload failed: empty response');
  }
  if (typeof result === 'string') {
    const text = result.trim();
    if (/^https?:\/\//i.test(text)) {
      return text;
    }
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        return resolveUploadUrl(JSON.parse(text), origin);
      } catch (error) {
        // 继续走下面的报错分支
      }
    }
    throw new Error(text || 'Upload failed');
  }
  if (Array.isArray(result)) {
    if (result.length === 0) {
      throw new Error('Upload failed: empty response');
    }
    return resolveUploadUrl(result[0], origin);
  }
  if (typeof result === 'object') {
    // 配置了 urlPrefix 时 publicUrl 才是最终可访问地址
    const url: string | undefined = result.publicUrl || result.src || result.url;
    if (!url) {
      throw new Error(result.error || result.message || 'Upload failed');
    }
    return /^https?:\/\//i.test(url) ? url : new URL(url, `${origin}/`).href;
  }
  throw new Error('Upload failed: unexpected response');
}

export default class CloudflareImgBedImageHostingService implements ImageHostingService {
  private config: CloudflareImgBedOption;

  constructor(config: CloudflareImgBedOption) {
    this.config = {
      origin: normalizeOrigin(config?.origin),
      authType: config?.authType || 'token',
      accessToken: (config?.accessToken || '').trim(),
      authCode: (config?.authCode || '').trim(),
      uploadChannel: (config?.uploadChannel || '').trim(),
      uploadFolder: (config?.uploadFolder || '').trim(),
    };
  }

  getId = () => {
    return md5(
      `${this.config.origin}|${this.config.authType}|${this.config.accessToken}|${this.config.authCode}`
    );
  };

  uploadImage = async ({ data }: UploadImageRequest) => {
    const blob = Base64ImageToBlob(data);
    return this.uploadBlob(blob, `web_clipper_${Date.now()}.${getExtension(blob.type)}`);
  };

  uploadImageUrl = async (url: string) => {
    const blob = await Container.get(IBasicRequestService).download(url);
    return this.uploadBlob(blob, getFileNameFromUrl(url, blob));
  };

  private getHeaders(): Record<string, string> {
    if (this.config.authType === 'token' && this.config.accessToken) {
      return { Authorization: `Bearer ${this.config.accessToken}` };
    }
    return {};
  }

  private getUploadUrl(): string {
    if (!this.config.origin) {
      throw new Error('Cloudflare ImgBed host is required');
    }
    // returnFormat=full 让服务端返回完整 URL，而不是 /file/xxx 相对路径
    const params = new URLSearchParams({ returnFormat: 'full' });
    if (this.config.uploadChannel) {
      params.set('uploadChannel', this.config.uploadChannel);
    }
    if (this.config.uploadFolder) {
      params.set('uploadFolder', this.config.uploadFolder);
    }
    if (this.config.authType === 'authCode' && this.config.authCode) {
      params.set('authCode', this.config.authCode);
    }
    return `${this.config.origin}/upload?${params.toString()}`;
  }

  private uploadBlob = async (blob: Blob, fileName: string): Promise<string> => {
    const request = new RequestHelper({
      request: Container.get(IBasicRequestService),
      headers: this.getHeaders(),
    });
    const formData = new FormData();
    formData.append('file', blob, fileName);
    const result = await request.postForm<any>(this.getUploadUrl(), { data: formData });
    return resolveUploadUrl(result, this.config.origin);
  };
}
