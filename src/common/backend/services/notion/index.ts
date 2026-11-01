import { ServiceMeta } from '@/common/backend';
import Service from './service';
import Form from './form';

export default (): ServiceMeta => {
  return {
    name: 'Notion',
    icon: 'https://app.notion.com/images/favicon.ico',
    type: 'notion',
    homePage: 'https://app.notion.com/',
    service: Service,
    form: Form,
    permission: {
      origins: ['https://api.notion.com/*'],
    },
  };
};
