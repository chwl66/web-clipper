import { KeyOutlined } from '@ant-design/icons';
import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input, Tooltip } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import React, { Fragment } from 'react';
import { FormattedMessage } from 'react-intl';
import locale from '@/common/locales';
import { NotionBackendServiceConfig } from './types';

const CreateTokenUrl = 'https://app.notion.com/developers/tokens';

interface NotionFormProps {
  verified?: boolean;
  info?: NotionBackendServiceConfig;
}

const NotionForm: React.FC<NotionFormProps & FormComponentProps> = ({
  form: { getFieldDecorator },
  info,
  verified,
}) => {
  return (
    <Fragment>
      <Form.Item
        label={
          <FormattedMessage
            id="backend.services.notion.form.accessToken"
            defaultMessage="Personal Token"
          />
        }
      >
        {getFieldDecorator('accessToken', {
          initialValue: info?.accessToken,
          rules: [
            {
              required: true,
              message: locale.format({
                id: 'backend.services.notion.form.accessToken.message',
                defaultMessage: 'Personal access token is required.',
              }),
            },
          ],
        })(
          <Input
            placeholder="secret_..."
            disabled={!!verified}
            suffix={
              <Tooltip
                title={locale.format({
                  id: 'backend.services.notion.form.generateToken',
                  defaultMessage: 'Create a personal access token',
                })}
              >
                <a href={CreateTokenUrl} target="_blank" rel="noreferrer noopener">
                  <KeyOutlined />
                </a>
              </Tooltip>
            }
          />
        )}
      </Form.Item>
      <div
        style={{
          marginTop: -16,
          marginBottom: 16,
          marginLeft: '29.16666667%',
          paddingLeft: 8,
          fontSize: 12,
          lineHeight: 1.6,
          color: 'rgba(0, 0, 0, 0.45)',
        }}
      >
        <FormattedMessage
          id="backend.services.notion.form.tip"
          defaultMessage="Create a token on app.notion.com/developers/tokens, enable the Notion API capability, then paste it here. The token acts as you, so no page sharing is required."
        />
      </div>
    </Fragment>
  );
};

export default NotionForm;
