import localeService from '@/common/locales';
import axios, { AxiosInstance } from 'axios';
import { CompleteStatus, UnauthorizedError } from './../interface';
import { CreateDocumentRequest, DocumentService } from '../../index';
import {
  EdgeEverBackendServiceConfig,
  EdgeEverMemo,
  EdgeEverNotebook,
  EdgeEverRepository,
  EdgeEverSession,
} from './types';

/** EdgeEver 标题字段上限 */
const MAX_TITLE_LENGTH = 160;

function normalizeOrigin(origin?: string) {
  return (origin || '').trim().replace(/\/+$/, '');
}

function getHostName(origin: string) {
  try {
    return new URL(origin).host;
  } catch (error) {
    return origin;
  }
}

function hashToken(value: string) {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) & 0xffffffff;
  }
  return `edgeever_${(hash >>> 0).toString(36)}`;
}

function getErrorMessage(error: any) {
  const data = error?.response?.data;
  if (data && typeof data === 'object') {
    if (data.error && typeof data.error.message === 'string') {
      return data.error.message;
    }
    if (typeof data.message === 'string') {
      return data.message;
    }
  }
  if (typeof data === 'string' && data.trim()) {
    return data.trim().slice(0, 200);
  }
  return error?.message || 'Unknown error';
}

export default class EdgeEverDocumentService implements DocumentService {
  private request: AxiosInstance;
  private config: EdgeEverBackendServiceConfig;
  private repositories: EdgeEverRepository[] = [];

  constructor(config?: EdgeEverBackendServiceConfig) {
    this.config = {
      origin: normalizeOrigin(config?.origin),
      accessToken: (config?.accessToken || '').trim(),
    };
    this.request = axios.create({
      baseURL: `${this.config.origin}/api/v1`,
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    this.request.interceptors.response.use(
      response => response,
      error => {
        if (error?.response?.status === 401) {
          return Promise.reject(
            new UnauthorizedError(
              localeService.format({
                id: 'backend.services.edgeever.unauthorizedErrorMessage',
                defaultMessage:
                  'Unauthorized! Please check the EdgeEver host and API token (it needs the read:notebooks and write:memos scopes).',
              })
            )
          );
        }
        return Promise.reject(
          new Error(
            localeService.format(
              {
                id: 'backend.services.edgeever.requestErrorMessage',
                defaultMessage: 'EdgeEver API error: {message}',
              },
              { message: getErrorMessage(error) }
            )
          )
        );
      }
    );
  }

  getId = () => {
    return hashToken(`${this.config.origin}|${this.config.accessToken}`);
  };

  getUserInfo = async () => {
    this.ensureConfig();
    const host = getHostName(this.config.origin);
    let session: EdgeEverSession | undefined;
    try {
      // API Token 认证时不会返回交互用户，这里只作为可选的展示信息
      const response = await this.request.get<EdgeEverSession>('auth/session');
      session = response.data;
    } catch (error) {
      session = undefined;
    }
    const user = session?.user;
    return {
      name: user?.displayName || user?.username || host,
      avatar: '',
      homePage: this.config.origin,
      description: user?.username || host,
    };
  };

  getRepositories = async (): Promise<EdgeEverRepository[]> => {
    this.ensureConfig();
    const response = await this.request.get<{ notebooks?: EdgeEverNotebook[] }>('notebooks');
    const notebooks = response.data?.notebooks ?? [];
    if (notebooks.length === 0) {
      throw new Error(
        localeService.format({
          id: 'backend.services.edgeever.emptyNotebookErrorMessage',
          defaultMessage: 'No notebook found in this EdgeEver instance, please create one first.',
        })
      );
    }

    const rootGroupName = localeService.format({
      id: 'backend.services.edgeever.group.root',
      defaultMessage: 'Notebooks',
    });
    const notebookNameMap: Record<string, string> = {};
    notebooks.forEach((notebook: EdgeEverNotebook) => {
      notebookNameMap[notebook.id] = notebook.name;
    });

    this.repositories = notebooks.map((notebook: EdgeEverNotebook) => {
      const parentId = notebook.parentId || 'root';
      return {
        id: notebook.id,
        name: notebook.name || 'Untitled',
        groupId: parentId,
        groupName: notebook.parentId ? notebookNameMap[notebook.parentId] || rootGroupName : rootGroupName,
        parentId: notebook.parentId ?? null,
      };
    });
    return this.repositories;
  };

  createDocument = async ({
    repositoryId,
    title,
    content,
  }: CreateDocumentRequest): Promise<CompleteStatus> => {
    this.ensureConfig();
    const notebookId = repositoryId || (await this.getDefaultNotebookId());
    const memoTitle = (title || '').trim().slice(0, MAX_TITLE_LENGTH);

    const payload: Record<string, any> = {
      notebookId,
      contentMarkdown: content || '',
    };
    if (memoTitle) {
      payload.title = memoTitle;
    }

    await this.request.post<{ memo?: EdgeEverMemo }>('memos', payload);
    return {
      href: this.config.origin,
    };
  };

  private async getDefaultNotebookId(): Promise<string> {
    if (this.repositories.length === 0) {
      await this.getRepositories();
    }
    const firstNotebook = this.repositories[0];
    if (!firstNotebook) {
      throw new Error(
        localeService.format({
          id: 'backend.services.edgeever.emptyNotebookErrorMessage',
          defaultMessage: 'No notebook found in this EdgeEver instance, please create one first.',
        })
      );
    }
    return firstNotebook.id;
  }

  private ensureConfig() {
    if (!this.config.origin || !this.config.accessToken) {
      throw new UnauthorizedError(
        localeService.format({
          id: 'backend.services.edgeever.unauthorizedErrorMessage',
          defaultMessage:
            'Unauthorized! Please check the EdgeEver host and API token (it needs the read:notebooks and write:memos scopes).',
        })
      );
    }
  }
}
