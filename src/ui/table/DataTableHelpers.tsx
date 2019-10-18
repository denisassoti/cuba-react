import {ColumnFilterItem, ColumnProps, FilterDropdownProps, PaginationConfig, SorterResult} from 'antd/es/table';
import React from 'react';
import {getPropertyCaption, getPropertyInfoNN} from '../../util/metadata';
import { MainStore } from '../../app/MainStore';
import {Condition, EntityFilter, EnumInfo, EnumValueInfo, MetaPropertyInfo} from '@cuba-platform/rest';
import {DataTableCell} from './DataTableCell';
import {
  ComparisonType,
  DataTableCustomFilter as CustomFilter,
  DataTableCustomFilterProps
} from './DataTableCustomFilter';
import {DataCollectionStore} from '../..';
import { toJS } from 'mobx';

/**
 * `filters` is an object received in antd `Table`'s `onChange` callback, it is a mapping between column names and currently applied filters.
 *
 * `operator` and `value` are lifted up from the custom filter component in order to allow operations on all filters at once,
 * such as clearing all filters.
 *
 * `customFilterRef` provides access to custom filter's `Form`, which can be used e.g. to clear the forms when clearing all filters.
 */
export interface ColumnWithCustomFilterConfig {
  propertyName: string,
  entityName: string,
  filters: Record<string, any> | undefined,
  operator: ComparisonType | undefined,
  onOperatorChange: (operator: ComparisonType, propertyName: string) => void,
  value: any,
  onValueChange: (value: any, propertyName: string) => void,
  enableSorter: boolean,
  mainStore: MainStore,
  customFilterRef?: (instance: React.Component<DataTableCustomFilterProps>) => void
}

/**
 *
 * @param config
 */
export function generateColumnWithCustomFilter<EntityType>(config: ColumnWithCustomFilterConfig): ColumnProps<EntityType> {
  const {
    propertyName,
    entityName,
    filters,
    operator,
    onOperatorChange,
    value,
    onValueChange,
    enableSorter,
    mainStore,
    customFilterRef
  } = config;

  let dataIndex: string;
  const propertyInfo = getPropertyInfoNN(propertyName as string, entityName, mainStore!.metadata!);

  switch(propertyInfo.attributeType) {
    case 'COMPOSITION':
    case 'ASSOCIATION':
      dataIndex = `${propertyName}._instanceName`;
      break;
    default:
      dataIndex = propertyName as string;
  }

  const localizedPropertyCaption = getPropertyCaption(propertyName as string, entityName, mainStore!.messages!);

  let defaultColumnProps: ColumnProps<EntityType> = {
    title: (
      <div
        style={{whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'clip'}}
        title={localizedPropertyCaption}>
          {localizedPropertyCaption}
        </div>
      ),
    dataIndex,
    sorter: enableSorter,
    key: propertyName as string,
    // According to the typings this field expects any[] | undefined
    // However, in reality undefined makes the filter icon to be highlighted.
    // If we want the icon to not be highlighted we need to pass null instead.
    // @ts-ignore
    filteredValue: (filters && filters[propertyName])
      ? toJS(filters[propertyName])
      : null,
    render: text => renderCell(propertyInfo, text, mainStore)
  };

  if (propertyInfo.attributeType === 'ENUM') {
    defaultColumnProps = {
      filters: generateEnumFilter(propertyInfo, mainStore),
      ...defaultColumnProps
    };
  } else {
    defaultColumnProps = {
      filterDropdown: generateCustomFilterDropdown(
        propertyName as string,
        entityName,
        operator,
        onOperatorChange,
        value,
        onValueChange,
        customFilterRef,
      ),
      ...defaultColumnProps
    };
  }

  return defaultColumnProps;
}

/**
 * Generates a standard antd table column filter for enum fields.
 *
 * @param propertyInfo
 * @param mainStore
 */
export function generateEnumFilter(propertyInfo: MetaPropertyInfo, mainStore: MainStore): ColumnFilterItem[] {
  const propertyEnumInfo: EnumInfo | undefined = mainStore!.enums!
    .find((enumInfo: EnumInfo) => {
      return enumInfo.name === propertyInfo.type;
    });

  if (!propertyEnumInfo) {
    return [];
  }

  return propertyEnumInfo.values.map((enumValueInfo: EnumValueInfo) => {
    return {
      text: enumValueInfo.caption,
      value: enumValueInfo.name
    };
  });
}

/**
 *
 * @param propertyName
 * @param entityName
 * @param operator
 * @param onOperatorChange
 * @param value
 * @param onValueChange
 * @param customFilterRefCallback
 */
export function generateCustomFilterDropdown(
  propertyName: string,
  entityName: string,
  operator: ComparisonType | undefined,
  onOperatorChange: (operator: ComparisonType, propertyName: string) => void,
  value: any,
  onValueChange: (value: any, propertyName: string) => void,
  customFilterRefCallback?: (instance: React.Component<DataTableCustomFilterProps>) => void,
): ((props: FilterDropdownProps) => React.ReactNode) {
  return (props: FilterDropdownProps) => {
    return (
      <CustomFilter entityName={entityName}
                    entityProperty={propertyName}
                    filterProps={props}
                    operator={operator}
                    onOperatorChange={onOperatorChange}
                    value={value}
                    onValueChange={onValueChange}
                    ref={customFilterRefCallback}
      />
    );
  }
}

/**
 * Generates a table cell that can be different depending on property type. See `DataTableCell` for details.
 *
 * @param propertyInfo
 * @param text
 * @param mainStore
 */
export function renderCell(propertyInfo: MetaPropertyInfo, text: any, mainStore: MainStore) {
  return DataTableCell({
    text,
    propertyInfo,
    mainStore
  });
}

/**
 * Sets filters on provided `dataCollection` based on current state of table filters
 *
 * @param tableFilters
 * @param fields
 * @param mainStore
 * @param dataCollection
 */
export function setFilters<E>(
  tableFilters: Record<string, string[]>,
  fields: string[],
  mainStore: MainStore,
  dataCollection: DataCollectionStore<E>,
) {
  let entityFilter: EntityFilter | undefined = undefined;

  if (tableFilters) {
    fields.forEach((propertyName: string) => {
      if (tableFilters.hasOwnProperty(propertyName) && tableFilters[propertyName] && tableFilters[propertyName].length > 0) {
        if (!entityFilter) {
          entityFilter = {
            conditions: []
          };
        }

        if (getPropertyInfoNN(
          propertyName as string, dataCollection.entityName, mainStore.metadata!
        ).attributeType === 'ENUM') {
          // @ts-ignore // TODO fix cuba-react typing
          entityFilter.conditions.push({
            property: propertyName,
            operator: 'in',
            value: tableFilters[propertyName],
          });
        } else {
          const {operator, value} = JSON.parse(tableFilters[propertyName][0]);
          if (operator === 'inInterval') {
            const {minDate, maxDate} = value;
            entityFilter.conditions.push({
              property: propertyName,
              operator: '>=',
              value: minDate,
            });
            entityFilter.conditions.push({
              property: propertyName,
              operator: '<=',
              value: maxDate,
            });
          } else {
            entityFilter.conditions.push({
              property: propertyName,
              operator,
              value,
            });
          }
        }
      }
    });
  }

  dataCollection.filter = entityFilter;
}

/**
 * Sets sort field/order on provided `dataCollection` based on current state of table `sorter`
 *
 * @param sorter
 * @param defaultSort name of the field to be sorted by. If the name is preceeding by the '+' character, then the sort order is ascending,
 * if by the '-' character then descending. If there is no special character before the property name, then ascending sort will be used.
 * @param dataCollection
 */
export function setSorter<E>(sorter: SorterResult<E>, defaultSort: string, dataCollection: DataCollectionStore<E>) {
  if (sorter && sorter.order) {
    const sortOrderPrefix: string = (sorter.order === 'descend') ? '-' : '+';

    let sortField: string;
    if (sorter.field.endsWith('._instanceName')) {
      sortField = sorter.field.substring(0, sorter.field.indexOf('.'));
    } else {
      sortField = sorter.field;
    }

    dataCollection.sort = sortOrderPrefix + sortField;
  } else {
    dataCollection.sort = defaultSort;
  }
}

/**
 *
 * @param pagination
 * @param dataCollection
 */
export function setPagination<E>(pagination: PaginationConfig, dataCollection: DataCollectionStore<E>) {
  if (pagination && pagination.pageSize && pagination.current) {
    dataCollection.limit = pagination.pageSize;
    dataCollection.offset = pagination.pageSize * (pagination.current - 1);
  }
}

/**
 * `pagination`, `filters` and `sorter` are received in antd `Table`'s `onChange` callback
 *
 * `defaultSort` - name of the field to be sorted by. If the name is preceeding by the '+' character, then the sort order is ascending,
 * if by the '-' character then descending. If there is no special character before the property name, then ascending sort will be used.
 *
 */
export interface TableChangeDTO<E> {
  pagination: PaginationConfig,
  filters: Record<string, string[]>,
  sorter: SorterResult<E>,
  defaultSort: string,
  fields: string[],
  mainStore: MainStore,
  dataCollection: DataCollectionStore<E>,
}

/**
 * When called from `Table`'s `onChange` callback this function will reload data collection taking into account antd `Table`'s filters, sorter and pagination
 *
 * @param tableChangeDTO
 */
export function handleTableChange<E>(tableChangeDTO: TableChangeDTO<E>) {
  const {
    pagination,
    filters,
    sorter,
    defaultSort,
    fields,
    mainStore,
    dataCollection
  } = tableChangeDTO;

  setFilters(filters, fields, mainStore, dataCollection);
  setSorter(sorter, defaultSort, dataCollection);
  setPagination(pagination, dataCollection);

  dataCollection.load();
}

/**
 * Converts EntityFilter to antd table filters object.
 * Useful e.g. to set the initial state of table filters when the table is loaded with a predefined EntityFilter.
 *
 * @param entityFilter
 */
export function entityFilterToTableFilters(entityFilter: EntityFilter): Record<string, any> {
  const tableFilters: Record<string, any> = {};

  entityFilter.conditions.forEach(condition => {
    if ('conditions' in condition) {
      throw new Error('EntityFilter with ConditionsGroup cannot be converted to table filters');
    }
    condition = condition as Condition;
    tableFilters[condition.property] = [JSON.stringify({
      operator: condition.operator,
      value: condition.value
    })];
  });

  return tableFilters;
}