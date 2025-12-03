import { CHAT_COMPONENT_MAP, MOBILE_COMPONENT_MAP, NON_PASCAL_CASE_NAMES, WEB_COMPONENT_MAP } from '../../_common/js/components'

const ALL_COMPONENT_MAP = {
  ...WEB_COMPONENT_MAP,
  ...MOBILE_COMPONENT_MAP,
  ...CHAT_COMPONENT_MAP,
}

// 转换为 PascalCase（仅支持 kebab-case、camelCase、PascalCase）
export function convert2PascalCase(name: string) {
  if (!name)
    return ''

  // 统一拆分：将驼峰断开并使用连字符
  const splitByCase = name
    // camelCase/PascalCase -> 加分隔符
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    // 多个连字符合并
    .replace(/-{2,}/g, '-')
    .toLowerCase()

  return splitByCase
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

// 归一化为 kebab-case（仅支持 kebab/camel/Pascal），用于大小写不敏感比对
function normalizeToKebab(name: string) {
  if (!name)
    return ''
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/-{2,}/g, '-')
    .toLowerCase()
}

// 预构建归一化别名查找表：避免每次都遍历和归一化
// 映射：normalizedAlias -> 原始 key（组件标识）
const NORMALIZED_ALIAS_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  Object.entries(ALL_COMPONENT_MAP).forEach(([key, values]) => {
    const normKey = normalizeToKebab(key)
    // 允许通过规范化后的 key 直接命中
    map[normKey] = key
    // 允许通过 values 别名命中（大小写/风格不敏感）
    values.forEach((v) => {
      const normVal = normalizeToKebab(v)
      map[normVal] = key
    })
  })
  return map
})()

export function getComponentName(title: string): string | null {
  // 提取方括号里的组件关键词
  const raw = /\[(.*?)\]/.exec(title)?.[1] || ''
  if (!raw)
    return null

  const keyword = normalizeToKebab(raw)
  const key = NORMALIZED_ALIAS_MAP[keyword]
  if (key)
    return NON_PASCAL_CASE_NAMES[key] || convert2PascalCase(key)

  // 退化：若没匹配到 map，但关键字本身像是合法组件名，尝试转 PascalCase 返回
  const fallback = convert2PascalCase(keyword)
  return fallback || null
}
