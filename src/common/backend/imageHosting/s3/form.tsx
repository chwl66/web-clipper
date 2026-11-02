import React, { Fragment } from 'react';
import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Checkbox, Input } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import { FormattedMessage } from 'react-intl';
import locale from '@/common/locales';
import { S3ImageHostingOption } from './service';

interface Props extends FormComponentProps {
  info?: S3ImageHostingOption;
}

export default ({ form: { getFieldDecorator }, info }: Props) => {
  const initInfo: Partial<S3ImageHostingOption> = info || {};
  const required = (id: string, defaultMessage: string) => ({
    required: true,
    message: locale.format({ id, defaultMessage }),
  });

  return (
    <Fragment>
      <Form.Item
        label={<FormattedMessage id="backend.imageHosting.s3.form.endpoint" defaultMessage="Endpoint" />}
      >
        {getFieldDecorator('endpoint', {
          initialValue: initInfo.endpoint,
          rules: [
            required(
              'backend.imageHosting.s3.form.endpoint.message',
              'S3 endpoint is required.'
            ),
            {
              type: 'url',
              message: locale.format({
                id: 'backend.imageHosting.s3.form.endpoint.invalid',
                defaultMessage: 'Please enter a full URL, e.g. https://s3.us-east-1.amazonaws.com',
              }),
            },
          ],
        })(<Input placeholder="https://s3.us-east-1.amazonaws.com" />)}
      </Form.Item>
      <Form.Item
        label={<FormattedMessage id="backend.imageHosting.s3.form.region" defaultMessage="Region" />}
      >
        {getFieldDecorator('region', {
          initialValue: initInfo.region || 'us-east-1',
          rules: [
            required('backend.imageHosting.s3.form.region.message', 'S3 region is required.'),
          ],
        })(<Input placeholder="us-east-1" />)}
      </Form.Item>
      <Form.Item
        label={<FormattedMessage id="backend.imageHosting.s3.form.bucket" defaultMessage="Bucket" />}
      >
        {getFieldDecorator('bucket', {
          initialValue: initInfo.bucket,
          rules: [
            required('backend.imageHosting.s3.form.bucket.message', 'S3 bucket is required.'),
          ],
        })(<Input placeholder="my-bucket" />)}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage id="backend.imageHosting.s3.form.accessKeyId" defaultMessage="Access Key ID" />
        }
      >
        {getFieldDecorator('accessKeyId', {
          initialValue: initInfo.accessKeyId,
          rules: [
            required(
              'backend.imageHosting.s3.form.accessKeyId.message',
              'Access key ID is required.'
            ),
          ],
        })(<Input placeholder="AKIA..." />)}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage
            id="backend.imageHosting.s3.form.secretAccessKey"
            defaultMessage="Secret Access Key"
          />
        }
      >
        {getFieldDecorator('secretAccessKey', {
          initialValue: initInfo.secretAccessKey,
          rules: [
            required(
              'backend.imageHosting.s3.form.secretAccessKey.message',
              'Secret access key is required.'
            ),
          ],
        })(<Input.Password placeholder="Secret Access Key" />)}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage id="backend.imageHosting.s3.form.pathPrefix" defaultMessage="Path Prefix" />
        }
      >
        {getFieldDecorator('pathPrefix', {
          initialValue: initInfo.pathPrefix ? initInfo.pathPrefix.replace(/\/+$/, '') : '',
        })(
          <Input
            placeholder={locale.format({
              id: 'backend.imageHosting.s3.form.pathPrefix.placeholder',
              defaultMessage: 'Optional, e.g. web-clipper',
            })}
          />
        )}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage id="backend.imageHosting.s3.form.publicUrl" defaultMessage="Public URL" />
        }
      >
        {getFieldDecorator('publicUrl', {
          initialValue: initInfo.publicUrl,
        })(
          <Input
            placeholder={locale.format({
              id: 'backend.imageHosting.s3.form.publicUrl.placeholder',
              defaultMessage: 'Optional CDN domain, e.g. https://cdn.example.com',
            })}
          />
        )}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage
            id="backend.imageHosting.s3.form.forcePathStyle"
            defaultMessage="Path Style"
          />
        }
      >
        {getFieldDecorator('forcePathStyle', {
          initialValue: initInfo.forcePathStyle !== false,
          valuePropName: 'checked',
        })(
          <Checkbox>
            <FormattedMessage
              id="backend.imageHosting.s3.form.forcePathStyle.tip"
              defaultMessage="Use path-style URL (endpoint/bucket/key), required by MinIO and most self-hosted services"
            />
          </Checkbox>
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
          id="backend.imageHosting.s3.form.tip"
          defaultMessage="The bucket must allow CORS PUT from this extension, and objects must be publicly readable (or set a public CDN domain). Cloudflare R2 uses region auto."
        />
      </div>
    </Fragment>
  );
};
