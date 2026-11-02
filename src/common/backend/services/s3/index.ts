import localeService from '@/common/locales';
import { ServiceMeta } from '@/common/backend';
import Service from './service';
import Form from './form';

export default (): ServiceMeta => {
  return {
    name: localeService.format({
      id: 'backend.services.s3.name',
      defaultMessage: 'S3 Bucket',
    }),
    icon: 'icons/s3.svg',
    type: 's3',
    homePage: '',
    service: Service,
    form: Form,
    permission: {
      origins: ['<all_urls>'], // endpoint 由用户填写
    },
  };
};
