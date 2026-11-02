import localeService from '@/common/locales';
import { ImageHostingServiceMeta } from '../interface';
import Service from './service';
import Form from './form';

export default (): ImageHostingServiceMeta => {
  return {
    name: localeService.format({
      id: 'backend.imageHosting.sda1.name',
      defaultMessage: 'SDA1',
    }),
    icon: 'icons/sda1.svg',
    type: 'sda1',
    service: Service,
    form: Form,
    permission: {
      origins: ['<all_urls>'], // 上传地址可自定义
    },
  };
};
