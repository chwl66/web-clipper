import Form from './form';
import { ImageHostingServiceMeta } from '../interface';
import Service from './service';

export default (): ImageHostingServiceMeta => {
  return {
    name: 'Cloudflare ImgBed',
    icon: 'icons/imgbed.png',
    type: 'cloudflare_imgbed',
    service: Service,
    form: Form,
    permission: {
      origins: ['<all_urls>'], // 图床为自建实例，地址由用户填写
    },
  };
};
