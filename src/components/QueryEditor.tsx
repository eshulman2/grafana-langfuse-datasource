import React from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Select, InlineField, InlineFieldRow } from '@grafana/ui';
import { LangfuseDatasource } from '../datasource';
import { Aggregation, LangfuseOptions, LangfuseQuery, QueryType, Resource } from '../types';
import { AGGREGATION_OPTIONS, RESOURCE_CONFIG, RESOURCE_OPTIONS } from '../resourceConfig';

const FIXED_QUERY_TYPE_OPTIONS: Array<SelectableValue<QueryType>> = [
  { label: 'Cost (traces)', value: 'trace_cost', description: 'Sum of LLM cost per time bucket' },
  { label: 'Latency (traces)', value: 'trace_latency', description: 'Average trace latency per time bucket' },
  { label: 'Volume (traces)', value: 'trace_count', description: 'Number of traces per time bucket' },
  { label: 'Token usage (observations)', value: 'observation_tokens', description: 'Total tokens (input + output) per time bucket' },
  { label: 'Cost (observations)', value: 'observation_cost', description: 'Sum of observation cost per time bucket' },
  { label: 'Traces viewer', value: 'traces_view', description: 'Show traces in Grafana trace view (use in Explore)' },
];

const MODE_OPTIONS: Array<SelectableValue<'fixed' | 'custom'>> = [
  { label: 'Fixed metric', value: 'fixed' },
  { label: 'Custom query', value: 'custom' },
];

type Props = QueryEditorProps<LangfuseDatasource, LangfuseQuery, LangfuseOptions>;

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const isCustom = query.queryType === 'custom';
  const currentResource: Resource = query.resource ?? 'traces';

  const onModeChange = (selected: SelectableValue<'fixed' | 'custom'>) => {
    if (selected.value === 'custom') {
      const defaultResource: Resource = query.resource ?? 'traces';
      const defaultField = query.field ?? RESOURCE_CONFIG[defaultResource].fieldOptions[0]?.value ?? '';
      onChange({
        ...query,
        queryType: 'custom',
        resource: defaultResource,
        field: defaultField,
        aggregation: query.aggregation ?? 'sum',
      });
    } else {
      onChange({ ...query, queryType: undefined, resource: undefined, field: undefined, aggregation: undefined });
    }
    onRunQuery();
  };

  const onFixedQueryTypeChange = (selected: SelectableValue<QueryType>) => {
    onChange({ ...query, queryType: selected.value! });
    onRunQuery();
  };

  const onResourceChange = (selected: SelectableValue<Resource>) => {
    const resource = selected.value!;
    const firstField = RESOURCE_CONFIG[resource].fieldOptions[0]?.value ?? '';
    onChange({ ...query, resource, field: firstField });
    onRunQuery();
  };

  const onFieldChange = (selected: SelectableValue<string>) => {
    onChange({ ...query, field: selected.value! });
    onRunQuery();
  };

  const onAggregationChange = (selected: SelectableValue<Aggregation>) => {
    onChange({ ...query, aggregation: selected.value! });
    onRunQuery();
  };

  return (
    <>
      <InlineFieldRow>
        <InlineField label="Mode" labelWidth={12}>
          <Select
            options={MODE_OPTIONS}
            value={isCustom ? 'custom' : 'fixed'}
            onChange={onModeChange}
            width={18}
          />
        </InlineField>
        {!isCustom && (
          <InlineField label="Metric" labelWidth={10}>
            <Select
              options={FIXED_QUERY_TYPE_OPTIONS}
              value={query.queryType}
              onChange={onFixedQueryTypeChange}
              placeholder="Select metric..."
              width={32}
            />
          </InlineField>
        )}
      </InlineFieldRow>
      {isCustom && (
        <InlineFieldRow>
          <InlineField label="Resource" labelWidth={12}>
            <Select
              options={RESOURCE_OPTIONS}
              value={currentResource}
              onChange={onResourceChange}
              width={18}
            />
          </InlineField>
          <InlineField label="Field" labelWidth={8}>
            <Select
              options={RESOURCE_CONFIG[currentResource].fieldOptions}
              value={query.field ?? RESOURCE_CONFIG[currentResource].fieldOptions[0]?.value}
              onChange={onFieldChange}
              width={26}
            />
          </InlineField>
          <InlineField label="Aggregation" labelWidth={14}>
            <Select
              options={AGGREGATION_OPTIONS}
              value={query.aggregation ?? 'sum'}
              onChange={onAggregationChange}
              width={14}
            />
          </InlineField>
        </InlineFieldRow>
      )}
    </>
  );
}
