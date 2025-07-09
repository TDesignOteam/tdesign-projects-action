import { coreError } from '../coreAlias';

/**
 * 查询单选字段选项 ID
 * @param options 选项列表
 * @param filedName 字段名称
 * @returns 选项 ID
 */
export const queryFieldsSingleSelectOptionId = async (
  options: { id: string; name: string }[],
  filedName: string
) => {
  const NeedToDoOption = options.find(
    (opt: { name: string }) => opt.name === filedName
  );
  if (!NeedToDoOption) {
    coreError('未找到 NeedToDoOption 目标选项');
    return null;
  }
  return NeedToDoOption.id;
};
