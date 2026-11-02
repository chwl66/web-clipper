import { Token } from 'typedi';

export type Method = 'get' | 'post' | 'put';

export interface BaseRequestOptions {
  method: Method;
  headers?: Record<string, string>;
}

export interface IPostFormRequestOptions extends BaseRequestOptions {
  method: 'post';
  requestType: 'form';
  data: FormData;
}
export interface IPostRequestOptions extends BaseRequestOptions {
  method: 'post';
  /**
   * json：JSON 序列化后发送；text：原样发送 body（上传二进制、纯文本等）
   */
  requestType: 'json' | 'text';
  data: any;
}

export interface IGetFormRequestOptions extends BaseRequestOptions {
  method: 'get';
}

export interface IPutRequestOptions extends BaseRequestOptions {
  method: 'put';
  data: any;
  /**
   * 默认按 json 序列化；传 'text' 时原样作为 body（例如上传 Blob 到对象存储）
   */
  requestType?: 'json' | 'form' | 'text';
}

export type TRequestOption =
  | IGetFormRequestOptions
  | IPostRequestOptions
  | IPostFormRequestOptions
  | IPutRequestOptions;

export interface IRequestService {
  request<T>(url: string, options: TRequestOption): Promise<T>;
  download(url: string): Promise<Blob>;
}

export type RequestInterceptor = (
  url: string,
  options: TRequestOption
) => {
  url?: string;
  options?: TRequestOption;
};

export type ResponseInterceptor = (data: unknown) => unknown;

export interface IExtendRequestHelper {
  post<T>(
    url: string,
    options: Omit<IPostRequestOptions, 'method' | 'requestType'> & {
      requestType?: 'json' | 'text';
    }
  ): Promise<T>;
  postForm<T>(
    url: string,
    options: Omit<IPostFormRequestOptions, 'method' | 'requestType'>
  ): Promise<T>;

  put<T>(url: string, options: Omit<IPutRequestOptions, 'method'>): Promise<T>;

  get<T>(url: string, options?: Omit<IGetFormRequestOptions, 'method'>): Promise<T>;
}

export interface IHelperOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  request: IRequestService;
  params?: Record<string, string>;
  interceptors?: {
    request?: RequestInterceptor[] | RequestInterceptor;
    response?: ResponseInterceptor[] | ResponseInterceptor;
  };
}

export const IBasicRequestService = new Token<IRequestService>();
