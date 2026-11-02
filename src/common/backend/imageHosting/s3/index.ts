import { ImageHostingServiceMeta } from '../interface';
import Service from './service';
import Form from './form';

export default (): ImageHostingServiceMeta => {
  return {
    name: 'S3 Storage',
    icon: 'icons/s3.svg',
    type: 's3',
    service: Service,
    form: Form,
    permission: {
      origins: ['<all_urls>'], // S3 兼容服务的地址由用户填写
    },
  };
};
