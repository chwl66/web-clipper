import { IBasicRequestService } from '@/service/common/request';
import { RequestHelper } from '@/service/request/common/request';
import { UploadImageRequest, ImageHostingService } from '../interface';
import { Base64ImageToBlob } from '@/common/blob';
import Container from 'typedi';
import md5 from '@web-clipper/shared/lib/md5';

export interface Sda1ImageHostingOption {
  /** 上传接口地址，留空使用官方地址 */
  uploadUrl?: string;
}

interface Sda1Response {
  success?: boolean;
  code?: string;
  message?: string;
  data?: {
    size?: number;
    path?: string;
    url?: string;
    delete_url?: string;
  };
}

const DEFAULT_UPLOAD_URL = 'https://p.sda1.dev/api/v1/upload_external_noform';
/** 流浪图床的公开限制：单文件 5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function getExtension(mimeType?: string, fallback = 'png') {
  return MIME_EXTENSIONS[(mimeType || '').toLowerCase()] || fallback;
}

function getFileNameFromUrl(url: string, blob: Blob) {
  try {
    const baseName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    if (/\.(jpe?g|png|gif|webp)$/i.test(baseName)) {
      return baseName;
    }
  } catch (error) {
    // ignore invalid url
  }
  return `web_clipper_${Date.now()}.${getExtension(blob.type)}`;
}

function describeError(error: any): string {
  const data = error?.data || error?.response?.data;
  if (data && typeof data === 'object' && data.message) {
    return `SDA1 upload failed: ${data.message}`;
  }
  const status = error?.response?.status || error?.status;
  if (status) {
    return `SDA1 upload failed (${status})`;
  }
  return 'SDA1 upload failed: request was blocked, please check the network or the upload URL.';
}

export default class Sda1ImageHostingService implements ImageHostingService {
  private uploadUrl: string;

  constructor(config?: Sda1ImageHostingOption) {
    this.uploadUrl = (config?.uploadUrl || DEFAULT_UPLOAD_URL).trim() || DEFAULT_UPLOAD_URL;
  }

  getId = () => {
    return md5(this.uploadUrl);
  };

  uploadImage = async ({ data }: UploadImageRequest) => {
    const blob = Base64ImageToBlob(data);
    return this.uploadBlob(blob);
  };

  uploadImageUrl = async (url: string) => {
    const blob = await Container.get(IBasicRequestService).download(url);
    return this.uploadBlob(blob, getFileNameFromUrl(url, blob));
  };

  private uploadBlob = async (blob: Blob, fileName?: string): Promise<string> => {
    if (blob.size > MAX_FILE_SIZE) {
      throw new Error('SDA1 upload failed: the file exceeds the 5MB limit of this image host.');
    }
    const mimeType = (blob.type || 'image/png').toLowerCase();
    if (!ALLOWED_TYPES.includes(mimeType)) {
      throw new Error(
        `SDA1 upload failed: only JPEG / PNG / GIF / WebP are supported, got ${mimeType}.`
      );
    }

    const name = fileName || `web_clipper_${Date.now()}.${getExtension(mimeType)}`;
    const separator = this.uploadUrl.includes('?') ? '&' : '?';
    const url = `${this.uploadUrl}${separator}filename=${encodeURIComponent(name)}`;

    const request = new RequestHelper({
      request: Container.get(IBasicRequestService),
    });

    let result: Sda1Response;
    try {
      result = await request.post<Sda1Response>(url, {
        data: blob,
        // text 让 umi-request 原样发送二进制 body（默认 json 会把 Blob 序列化成 "{}"）
        requestType: 'text',
        headers: {
          'Content-Type': mimeType,
        },
      });
    } catch (error) {
      throw new Error(describeError(error));
    }

    const remoteUrl = result?.data?.url;
    if (!remoteUrl) {
      throw new Error(result?.message || 'SDA1 upload failed: unexpected response.');
    }
    return remoteUrl;
  };
}
