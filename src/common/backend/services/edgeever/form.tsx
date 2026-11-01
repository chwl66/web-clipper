import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import React, { Fragment } from 'react';
import { FormattedMessage } from 'react-intl';
import locale from '@/common/locales';
import { EdgeEverBackendServiceConfig } from './types';

interface EdgeEverFormProps {
  verified?: boolean;
  info?: EdgeEverBackendServiceConfig;
}

const EdgeEverForm: React.FC<EdgeEverFormProps & FormComponentProps> = ({
  form: { getFieldDecorator },
  info,
  verified,
}) => {
  return (
    <Fragment>
      <Form.Item
        label={<FormattedMessage id="backend.services.edgeever.form.host" defaultMessage="Host" />}
      >
        {getFieldDecorator('origin', {
          initialValue: info?.origin || 'http://localhost:8787',
          rules: [
            {
              required: true,
              message: locale.format({
                id: 'backend.services.edgeever.form.host.message',
                defaultMessage: 'EdgeEver host is required.',
              }),
            },
            {
              type: 'url',
              message: locale.format({
                id: 'backend.services.edgeever.form.host.invalid',
                defaultMessage: 'Please enter a full URL, e.g. https://notes.example.com',
              }),
            },
          ],
        })(<Input placeholder="https://notes.example.com" disabled={!!verified} />)}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage id="backend.services.edgeever.form.accessToken" defaultMessage="API Token" />
        }
      >
        {getFieldDecorator('accessToken', {
          initialValue: info?.accessToken,
          rules: [
            {
              required: true,
              message: locale.format({
                id: 'backend.services.edgeever.form.accessToken.message',
                defaultMessage: 'EdgeEver API token is required.',
              }),
            },
          ],
        })(<Input.Password placeholder="EdgeEver API token" disabled={!!verified} />)}
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
          id="backend.services.edgeever.form.tip"
          defaultMessage="Create an API token in EdgeEver Profile -> API / MCP. The token needs the read:notebooks and write:memos scopes."
        />
      </div>
    </Fragment>
  );
};

export default EdgeEverForm;
