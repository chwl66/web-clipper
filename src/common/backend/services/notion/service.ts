import localeService from '@/common/locales';
import axios, { AxiosInstance } from 'axios';
import { CompleteStatus, UnauthorizedError } from './../interface';
import { CreateDocumentRequest, DocumentService } from '../../index';
import { markdownToBlocks } from './markdown';
import {
  NotionBackendServiceConfig,
  NotionBlock,
  NotionDatabaseObject,
  NotionPageObject,
  NotionRepository,
  NotionRepositoryType,
  NotionRichText,
  NotionSearchResponse,
  NotionSearchResult,
  NotionUser,
} from './types';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const NOTION_HOME = 'https://app.notion.com/';
const DEFAULT_AVATAR = 'https://app.notion.com/images/logo-ios.png';
/** Notion 单次请求最多写入 100 个 block，这里留一点余量 */
const MAX_BLOCKS_PER_REQUEST = 80;
const PAGE_SIZE = 100;
const MAX_REPOSITORIES = 300;
const MAX_RETRY_COUNT = 2;

type NotionPageCreateResponse = {
  id: string;
  url?: string;
};

function hashToken(token: string): string {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) & 0xffffffff;
  }
  return `notion_${(hash >>> 0).toString(36)}`;
}

function countBlocks(block: NotionBlock): number {
  const children = block[block.type]?.children;
  if (!Array.isArray(children)) {
    return 1;
  }
  return children.reduce<number>((total, child) => total + countBlocks(child), 1);
}

/**
 * Notion 限制单次请求写入 100 个 block（含嵌套 children），按累计数量切分
 */
function chunkBlocks(blocks: NotionBlock[], limit: number): NotionBlock[][] {
  const batches: NotionBlock[][] = [];
  let current: NotionBlock[] = [];
  let currentCount = 0;

  blocks.forEach(block => {
    const count = countBlocks(block);
    if (current.length > 0 && currentCount + count > limit) {
      batches.push(current);
      current = [];
      currentCount = 0;
    }
    current.push(block);
    currentCount += count;
  });

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function joinPlainText(richText?: Array<{ plain_text?: string }>): string {
  if (!Array.isArray(richText)) {
    return '';
  }
  return richText.map(item => item.plain_text || '').join('');
}

function getPageTitle(page: NotionPageObject): string {
  const properties = page.properties || {};
  const keys = Object.keys(properties);
  for (const key of keys) {
    const property = properties[key];
    if (property && property.type === 'title') {
      const title = joinPlainText(property.title);
      if (title) {
        return title;
      }
    }
  }
  // 兜底：某些页面 title 属性的 type 字段缺失，直接取第一个带 title 数组的属性
  for (const key of keys) {
    const title = joinPlainText(properties[key]?.title);
    if (title) {
      return title;
    }
  }
  return '';
}

function getDatabaseTitle(database: NotionDatabaseObject): string {
  return joinPlainText(database.title);
}

/**
 * 图片 URL 不可访问时会让整批 block 写入失败，这里降级成带链接的段落
 */
function degradeImages(blocks: NotionBlock[]): NotionBlock[] {
  return blocks.map(block => {
    if (block.type !== 'image') {
      return block;
    }
    const url: string = block.image?.external?.url || '';
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: url,
              link: url ? { url } : null,
            },
          },
        ],
      },
    };
  });
}

function containsImage(blocks: NotionBlock[]): boolean {
  return blocks.some(block => block.type === 'image');
}

export default class NotionDocumentService implements DocumentService {
  private request: AxiosInstance;
  private config: NotionBackendServiceConfig;
  private repositories: NotionRepository[] = [];

  constructor(config?: NotionBackendServiceConfig) {
    this.config = {
      accessToken: (config?.accessToken || '').trim(),
    };
    this.request = axios.create({
      baseURL: NOTION_API,
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    this.request.interceptors.response.use(
      response => response,
      async error => {
        const status = error?.response?.status as number | undefined;
        if (status === 429) {
          const retryCount = (error.config?.__retryCount as number) || 0;
          if (retryCount < MAX_RETRY_COUNT) {
            const retryAfter = Number(error.response?.headers?.['retry-after']) || 1;
            await sleep(Math.min(retryAfter, 5) * 1000);
            error.config.__retryCount = retryCount + 1;
            return this.request.request(error.config);
          }
        }
        if (status === 401) {
          return Promise.reject(
            new UnauthorizedError(
              localeService.format({
                id: 'backend.services.notion.unauthorizedErrorMessage',
                defaultMessage:
                  'Unauthorized! Please check whether your Notion personal access token is valid.',
              })
            )
          );
        }
        const message = error?.response?.data?.message || error?.message || 'Unknown error';
        return Promise.reject(
          new Error(
            localeService.format(
              {
                id: 'backend.services.notion.requestErrorMessage',
                defaultMessage: 'Notion API error: {message}',
              },
              { message }
            )
          )
        );
      }
    );
  }

  getId = () => {
    return hashToken(this.config.accessToken);
  };

  /**
   * 老版本用 cookie 绑定的账号没有令牌，这里直接给出明确提示，避免发出一堆 401 请求
   */
  private ensureToken() {
    if (!this.config.accessToken) {
      throw new UnauthorizedError(
        localeService.format({
          id: 'backend.services.notion.form.accessToken.message',
          defaultMessage: 'Personal access token is required.',
        })
      );
    }
  }

  getUserInfo = async () => {
    this.ensureToken();
    const meResponse = await this.request.get<NotionUser>('users/me');
    const me = meResponse.data;
    let person: NotionUser | undefined = me.type === 'person' ? me : undefined;

    if (!person) {
      const ownerId = me.bot?.owner?.user?.id;
      if (ownerId) {
        try {
          const ownerResponse = await this.request.get<NotionUser>(`users/${ownerId}`);
          person = ownerResponse.data;
        } catch (error) {
          person = undefined;
        }
      }
    }

    return {
      name: person?.name || me.name || 'Notion',
      avatar: person?.avatar_url || me.avatar_url || DEFAULT_AVATAR,
      homePage: NOTION_HOME,
      description: person?.person?.email || '',
    };
  };

  getRepositories = async (): Promise<NotionRepository[]> => {
    this.ensureToken();
    const repositories: NotionRepository[] = [];
    let cursor: string | null | undefined;

    while (repositories.length < MAX_REPOSITORIES) {
      const response = await this.request.post<NotionSearchResponse>('search', {
        page_size: PAGE_SIZE,
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      const data = response.data || {};
      const results: NotionSearchResult[] = data.results || [];
      results.forEach(result => {
        const repository = this.toRepository(result);
        if (repository) {
          repositories.push(repository);
        }
      });

      if (!data.has_more || !data.next_cursor) {
        break;
      }
      cursor = data.next_cursor;
    }

    if (repositories.length === 0) {
      throw new Error(
        localeService.format({
          id: 'backend.services.notion.emptyRepositoryErrorMessage',
          defaultMessage:
            'No Notion page or database found. Please make sure the token has the Notion API capability and the workspace has content.',
        })
      );
    }

    this.repositories = repositories;
    return repositories;
  };

  createDocument = async ({
    repositoryId,
    title,
    content,
  }: CreateDocumentRequest): Promise<CompleteStatus> => {
    const parentType = await this.getRepositoryType(repositoryId);
    const blocks = markdownToBlocks(content);
    const page = await this.createPage(repositoryId, parentType, title);
    const pageId = page.id;

    const batches = chunkBlocks(blocks, MAX_BLOCKS_PER_REQUEST);
    for (const batch of batches) {
      await this.appendBlocks(pageId, batch);
    }

    return {
      href: page.url || `${NOTION_HOME}${pageId.replace(/-/g, '')}`,
    };
  };

  private toRepository(result: NotionSearchResult): NotionRepository | null {
    if (result.object === 'page') {
      return {
        id: result.id,
        name: getPageTitle(result) || 'Untitled',
        groupId: 'page',
        groupName: localeService.format({
          id: 'backend.services.notion.group.page',
          defaultMessage: 'Pages',
        }),
        pageType: 'page',
      };
    }
    if (result.object === 'database') {
      return {
        id: result.id,
        name: getDatabaseTitle(result) || 'Untitled',
        groupId: 'database',
        groupName: localeService.format({
          id: 'backend.services.notion.group.database',
          defaultMessage: 'Databases',
        }),
        pageType: 'database',
      };
    }
    return null;
  }

  private async getRepositoryType(repositoryId: string): Promise<NotionRepositoryType> {
    const cached = this.repositories.find(o => o.id === repositoryId);
    if (cached) {
      return cached.pageType;
    }
    // 剪藏弹窗可能直接使用上次缓存的 ID，此时需要探测目标类型
    try {
      await this.request.get(`pages/${repositoryId}`);
      return 'page';
    } catch (error) {
      try {
        await this.request.get(`databases/${repositoryId}`);
        return 'database';
      } catch (databaseError) {
        throw new Error(
          localeService.format({
            id: 'backend.services.notion.repositoryNotFoundErrorMessage',
            defaultMessage:
              'Cannot access this Notion page/database, please re-select a target in the preferences.',
          })
        );
      }
    }
  }

  private async getDatabaseTitleProperty(databaseId: string): Promise<string> {
    const response = await this.request.get<{
      properties?: Record<string, { type?: string; name?: string }>;
    }>(`databases/${databaseId}`);
    const properties = response.data?.properties || {};
    const key = Object.keys(properties).find(
      propertyKey => properties[propertyKey]?.type === 'title'
    );
    return key || 'Name';
  }

  private async createPage(
    parentId: string,
    parentType: NotionRepositoryType,
    title: string
  ): Promise<NotionPageCreateResponse> {
    const richText: NotionRichText[] = title
      ? [{ type: 'text', text: { content: title.slice(0, 2000) } }]
      : [];

    const properties: Record<string, any> = {};
    if (parentType === 'database') {
      const titleProperty = await this.getDatabaseTitleProperty(parentId);
      properties[titleProperty] = { title: richText };
    } else {
      properties.title = { title: richText };
    }

    const response = await this.request.post<NotionPageCreateResponse>('pages', {
      parent: parentType === 'database' ? { database_id: parentId } : { page_id: parentId },
      properties,
    });
    return response.data;
  }

  private async appendBlocks(pageId: string, blocks: NotionBlock[]) {
    if (blocks.length === 0) {
      return;
    }
    try {
      await this.request.patch(`blocks/${pageId}/children`, { children: blocks });
    } catch (error) {
      if (!containsImage(blocks)) {
        throw error;
      }
      // 图片外链可能被防盗链拦截，降级成普通链接再试一次
      await this.request.patch(`blocks/${pageId}/children`, { children: degradeImages(blocks) });
    }
  }
}
