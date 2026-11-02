import localeService from '@/common/locales';
import md5 from '@web-clipper/shared/lib/md5';
import { normalizePrefix, S3Client } from '@/common/backend/s3/client';
import { CreateDocumentRequest, DocumentService } from '../../index';
import { CompleteStatus, Repository } from '../interface';
import { S3BackendServiceConfig } from './types';

/** 文件名长度上限，避免 S3 key 过长 */
const MAX_TITLE_LENGTH = 80;

/**
 * S3 没有目录概念，这里把标题转成安全的文件名：
 * 去掉路径分隔符与 Windows 非法字符，压缩空白
 */
export function sanitizeFileName(title?: string) {
  const cleaned = (title || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .replace(/[. ]+$/, '');
  return cleaned || 'untitled';
}

export default class S3DocumentService implements DocumentService {
  private client: S3Client;
  private config: S3BackendServiceConfig;
  private pathPrefix: string;

  constructor(config?: S3BackendServiceConfig) {
    this.config = {
      endpoint: config?.endpoint || '',
      region: config?.region || '',
      bucket: config?.bucket || '',
      accessKeyId: config?.accessKeyId || '',
      secretAccessKey: config?.secretAccessKey || '',
      pathPrefix: config?.pathPrefix,
      publicUrl: config?.publicUrl,
      forcePathStyle: config?.forcePathStyle,
    };
    this.client = new S3Client(this.config);
    this.pathPrefix = normalizePrefix(config?.pathPrefix);
  }

  getId = () => {
    return md5(`${this.client.endpoint}|${this.client.bucket}|${this.config.accessKeyId}`);
  };

  getUserInfo = async () => {
    return {
      name: this.client.bucket || 'S3',
      avatar: '',
      homePage: this.client.endpoint,
      description: this.getRepositoryName(),
    };
  };

  getRepositories = async (): Promise<Repository[]> => {
    // 配置不全时直接抛错，让「校验」阶段就能给出提示
    this.client.ensureConfig();
    return [
      {
        id: 's3',
        name: this.getRepositoryName(),
        groupId: 's3',
        groupName: localeService.format({
          id: 'backend.services.s3.groupName',
          defaultMessage: 'S3',
        }),
      },
    ];
  };

  createDocument = async ({
    title,
    content,
  }: CreateDocumentRequest): Promise<CompleteStatus> => {
    const key = this.buildKey(title);
    const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' });
    await this.client.putObject(key, blob, 'text/markdown;charset=utf-8');
    return {
      href: this.client.buildPublicUrl(key, this.config.publicUrl),
    };
  };

  private getRepositoryName() {
    if (!this.pathPrefix) {
      return this.client.bucket;
    }
    return `${this.client.bucket}/${this.pathPrefix.replace(/\/$/, '')}`;
  }

  /**
   * 文件按「前缀/年-月/标题.md」存放，同一篇文章重复剪藏会覆盖同一个文件
   */
  private buildKey(title?: string) {
    const date = new Date();
    const folder = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
    ].join('-');
    return `${this.pathPrefix}${folder}/${sanitizeFileName(title)}.md`;
  }
}
