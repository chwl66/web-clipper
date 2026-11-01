import { Repository } from '../interface';

/**
 * Notion 个人令牌（Personal Access Token）配置
 * 在 https://app.notion.com/developers/tokens 创建，需要勾选 Notion API capability
 */
export interface NotionBackendServiceConfig {
  accessToken: string;
}

export interface NotionAnnotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
}

export interface NotionRichText {
  type: 'text';
  text: {
    content: string;
    link?: { url: string } | null;
  };
  annotations?: NotionAnnotations;
}

export interface NotionBlock {
  object: 'block';
  type: string;
  // 每种 block 类型把自己的内容放在同名字段里，例如 paragraph: { rich_text: [] }
  [key: string]: any;
}

export interface NotionUser {
  object: 'user';
  id: string;
  type?: 'person' | 'bot';
  name?: string | null;
  avatar_url?: string | null;
  person?: {
    email?: string;
  };
  bot?: {
    owner?: {
      type?: string;
      user?: NotionUser;
    };
  };
}

export interface NotionTitleProperty {
  id?: string;
  type?: string;
  title?: Array<{ plain_text?: string }>;
}

export interface NotionPageObject {
  object: 'page';
  id: string;
  url?: string;
  last_edited_time?: string;
  parent?: {
    type?: string;
    page_id?: string;
    database_id?: string;
    workspace?: boolean;
  };
  properties?: Record<string, NotionTitleProperty>;
}

export interface NotionDatabaseObject {
  object: 'database';
  id: string;
  url?: string;
  last_edited_time?: string;
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, { id?: string; type?: string; name?: string }>;
}

export type NotionSearchResult = NotionPageObject | NotionDatabaseObject;

export interface NotionSearchResponse {
  object?: 'list';
  results?: NotionSearchResult[];
  has_more?: boolean;
  next_cursor?: string | null;
}

export type NotionRepositoryType = 'page' | 'database';

export interface NotionRepository extends Repository {
  pageType: NotionRepositoryType;
}
