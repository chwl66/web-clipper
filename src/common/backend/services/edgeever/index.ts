import { ServiceMeta } from '@/common/backend';
import Service from './service';
import Form from './form';

export default (): ServiceMeta => {
  return {
    name: 'EdgeEver',
    icon: 'https://edgeever.org/favicon.ico',
    type: 'edgeever',
    homePage: 'https://edgeever.org/',
    service: Service,
    form: Form,
    permission: {
      // 实例地址由用户填写（Cloudflare / Docker / 自定义域名），只能申请较宽泛的域名权限
      origins: ['<all_urls>'],
    },
  };
};
