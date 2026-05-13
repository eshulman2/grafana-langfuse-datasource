import React from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Select, InlineField } from '@grafana/ui';
import { LangfuseDatasource } from '../datasource';
import { LangfuseOptions, LangfuseQuery, QueryType } from '../types';

const QUERY_TYPE_OPTIONS: Array<SelectableValue<QueryType>> = [
  { label: 'Cost (traces)', value: 'trace_cost', description: 'Sum of LLM cost per time bucket' },
  { label: 'Latency (traces)', value: 'trace_latency', description: 'Average trace latency per time bucket' },
  { label: 'Volume (traces)', value: 'trace_count', description: 'Number of traces per time bucket' },
  { label: 'Token usage (observations)', value: 'observation_tokens', description: 'Total tokens (input + output) per time bucket' },
  { label: 'Cost (observations)', value: 'observation_cost', description: 'Sum of observation cost per time bucket' },
];

type Props = QueryEditorProps<LangfuseDatasource, LangfuseQuery, LangfuseOptions>;

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const onQueryTypeChange = (selected: SelectableValue<QueryType>) => {
    onChange({ ...query, queryType: selected.value! });
    onRunQuery();
  };

  return (
    <InlineField label="Metric" labelWidth={12}>
      <Select
        options={QUERY_TYPE_OPTIONS}
        value={query.queryType}
        onChange={onQueryTypeChange}
        placeholder="Select metric..."
        width={32}
      />
    </InlineField>
  );
}
