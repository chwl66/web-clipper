import { Repository } from '../interface';

/**
 * EdgeEver 是自托管的开源笔记应用（Evernote 风格），
 * 通过 REST API + API Token 写入，实例地址由用户自己填写。
 */
export interface EdgeEverBackendServiceConfig {
  /** 实例地址，例如 http://localhost:8787 或 https://notes.example.com */
  origin: string;
  /** 在 Profile -> API / MCP 生成的访问令牌 */
  accessToken: string;
}

export interface EdgeEverNotebook {
  id: string;
  parentId?: string | null;
  name: string;
  slug?: string;
  memoCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EdgeEverMemo {
  id: string;
  title?: string | null;
  notebookId?: string;
  updatedAt?: string;
}

export interface EdgeEverSession {
  authRequired?: boolean;
  authenticated?: boolean;
  demoMode?: boolean;
  user?: {
    id: string;
    username: string;
    displayName?: string | null;
    role?: string;
  } | null;
}

export interface EdgeEverRepository extends Repository {
  parentId?: string | null;
}
