import { DataSourcePlugin } from '@grafana/data';
import { LangfuseDatasource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { LangfuseOptions, LangfuseQuery } from './types';

export const plugin = new DataSourcePlugin<LangfuseDatasource, LangfuseQuery, LangfuseOptions>(
  LangfuseDatasource
)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
