export interface S3BackendServiceConfig {
  /** 服务地址，例如 https://s3.us-east-1.amazonaws.com 或 https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  /** 区域，AWS 用 us-east-1 这类值，Cloudflare R2 用 auto */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 对象前缀（目录），例如 notes，可留空 */
  pathPrefix?: string;
  /** 自定义访问域名（CDN / 公共读域名），用于拼「打开」链接 */
  publicUrl?: string;
  /** MinIO 等自建服务通常需要 path-style 地址 */
  forcePathStyle?: boolean;
}
