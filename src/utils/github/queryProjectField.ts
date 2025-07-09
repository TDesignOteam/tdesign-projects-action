import { coreInfo, coreError } from '../coreAlias';
import { ProjectV2 } from '../../types/index';

/**
 * 查询 field 项目字段
 * @param project 项目
 * @param fieldName 字段名称
 * @returns 字段
 */
export async function queryProjectField(project: ProjectV2, fieldName: string) {
  const field = project.fields.nodes.find((f) => f.name === fieldName);
  if (field) {
    coreInfo(`字段 "${fieldName}" 的 field_id 是: ${field?.id}`);
    return field;
  } else {
    coreError(`没有找到字段 "${fieldName}"`);
    return null;
  }
}
