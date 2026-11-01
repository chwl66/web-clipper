import React, { Fragment, useState } from 'react';
import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input, Select } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import { FormattedMessage } from 'react-intl';
import locale from '@/common/locales';
import { CloudflareImgBedOption } from './service';

interface Props extends FormComponentProps {
  info?: CloudflareImgBedOption;
}

const CHANNEL_OPTIONS: Array<{ value: string; label: React.ReactNode }> = [
  {
    value: '',
    label: (
      <FormattedMessage
        id="backend.imageHosting.cloudflare_imgbed.form.channel.default"
        defaultMessage="Default"
      />
    ),
  },
  { value: 'telegram', label: 'Telegram' },
  { value: 'cfr2', label: 'Cloudflare R2' },
  { value: 's3', label: 'S3' },
  { value: 'discord', label: 'Discord' },
  { value: 'huggingface', label: 'HuggingFace' },
  { value: 'webdav', label: 'WebDAV' },
  { value: 'external', label: 'External' },
];

export default ({ form: { getFieldDecorator }, info }: Props) => {
  const initInfo: Partial<CloudflareImgBedOption> = info || {};
  const [authType, setAuthType] = useState<string>(initInfo.authType || 'token');

  return (
    <Fragment>
      <Form.Item
        label={
          <FormattedMessage id="backend.imageHosting.cloudflare_imgbed.form.origin" defaultMessage="Host" />
        }
      >
        {getFieldDecorator('origin', {
          initialValue: initInfo.origin,
          rules: [
            {
              required: true,
              message: locale.format({
                id: 'backend.imageHosting.cloudflare_imgbed.form.origin.message',
                defaultMessage: 'Cloudflare ImgBed host is required.',
              }),
            },
            {
              type: 'url',
              message: locale.format({
                id: 'backend.imageHosting.cloudflare_imgbed.form.origin.invalid',
                defaultMessage: 'Please enter a full URL, e.g. https://img.example.com',
              }),
            },
          ],
        })(<Input placeholder="https://img.example.com" />)}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage
            id="backend.imageHosting.cloudflare_imgbed.form.authType"
            defaultMessage="Auth"
          />
        }
      >
        {getFieldDecorator('authType', {
          initialValue: initInfo.authType || 'token',
        })(
          <Select onChange={value => setAuthType(value as string)}>
            <Select.Option value="token">API Token</Select.Option>
            <Select.Option value="authCode">
              <FormattedMessage
                id="backend.imageHosting.cloudflare_imgbed.form.authType.authCode"
                defaultMessage="Auth code"
              />
            </Select.Option>
            <Select.Option value="none">
              <FormattedMessage
                id="backend.imageHosting.cloudflare_imgbed.form.authType.none"
                defaultMessage="None"
              />
            </Select.Option>
          </Select>
        )}
      </Form.Item>
      {authType === 'token' && (
        <Form.Item
          label={
            <FormattedMessage
              id="backend.imageHosting.cloudflare_imgbed.form.accessToken"
              defaultMessage="API Token"
            />
          }
        >
          {getFieldDecorator('accessToken', {
            initialValue: initInfo.accessToken,
            rules: [
              {
                required: true,
                message: locale.format({
                  id: 'backend.imageHosting.cloudflare_imgbed.form.accessToken.message',
                  defaultMessage: 'API token is required.',
                }),
              },
            ],
          })(<Input.Password placeholder="API token" />)}
        </Form.Item>
      )}
      {authType === 'authCode' && (
        <Form.Item
          label={
            <FormattedMessage
              id="backend.imageHosting.cloudflare_imgbed.form.authCode"
              defaultMessage="Auth Code"
            />
          }
        >
          {getFieldDecorator('authCode', {
            initialValue: initInfo.authCode,
          })(<Input.Password placeholder="authCode" />)}
        </Form.Item>
      )}
      <Form.Item
        label={
          <FormattedMessage
            id="backend.imageHosting.cloudflare_imgbed.form.channel"
            defaultMessage="Upload Channel"
          />
        }
      >
        {getFieldDecorator('uploadChannel', {
          initialValue: initInfo.uploadChannel || '',
        })(
          <Select>
            {CHANNEL_OPTIONS.map(option => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        )}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage
            id="backend.imageHosting.cloudflare_imgbed.form.folder"
            defaultMessage="Upload Folder"
          />
        }
      >
        {getFieldDecorator('uploadFolder', {
          initialValue: initInfo.uploadFolder,
        })(
          <Input
            placeholder={locale.format({
              id: 'backend.imageHosting.cloudflare_imgbed.form.folder.placeholder',
              defaultMessage: 'Optional, e.g. web-clipper',
            })}
          />
        )}
      </Form.Item>
      <div
        style={{
          marginTop: -8,
          marginBottom: 8,
          marginLeft: '29.16666667%',
          paddingLeft: 8,
          fontSize: 12,
          lineHeight: 1.6,
          color: 'rgba(0, 0, 0, 0.45)',
        }}
      >
        <FormattedMessage
          id="backend.imageHosting.cloudflare_imgbed.form.tip"
          defaultMessage="Create an API token in the ImgBed dashboard (API Token management) with upload permission, or use the access code of the site. Leave the channel empty to use the default channel of your ImgBed settings."
        />
      </div>
    </Fragment>
  );
};
