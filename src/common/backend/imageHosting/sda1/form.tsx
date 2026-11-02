import React, { Fragment } from 'react';
import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import { FormattedMessage } from 'react-intl';
import locale from '@/common/locales';
import { Sda1ImageHostingOption } from './service';

interface Props extends FormComponentProps {
  info?: Sda1ImageHostingOption;
}

export default ({ form: { getFieldDecorator }, info }: Props) => {
  const initInfo: Partial<Sda1ImageHostingOption> = info || {};
  return (
    <Fragment>
      <Form.Item
        label={
          <FormattedMessage id="backend.imageHosting.sda1.form.uploadUrl" defaultMessage="Upload URL" />
        }
      >
        {getFieldDecorator('uploadUrl', {
          initialValue: initInfo.uploadUrl,
          rules: [
            {
              type: 'url',
              message: locale.format({
                id: 'backend.imageHosting.sda1.form.uploadUrl.invalid',
                defaultMessage: 'Please enter a full URL.',
              }),
            },
          ],
        })(
          <Input
            placeholder={locale.format({
              id: 'backend.imageHosting.sda1.form.uploadUrl.placeholder',
              defaultMessage: 'Leave empty to use https://p.sda1.dev',
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
          id="backend.imageHosting.sda1.form.tip"
          defaultMessage="Public image host, no token required. Only JPEG / PNG / GIF / WebP up to 5MB, and uploaded files are public."
        />
      </div>
    </Fragment>
  );
};
