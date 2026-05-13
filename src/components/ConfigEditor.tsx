import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { LangfuseOptions } from '../types';

type Props = DataSourcePluginOptionsEditorProps<LangfuseOptions>;

export function ConfigEditor(_props: Props) {
  // Grafana renders the URL field and Basic Auth (username/password) fields
  // automatically. No custom configuration needed for v1.
  return null;
}
