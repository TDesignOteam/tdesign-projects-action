import { CHAT_COMPONENT_MAP, MOBILE_COMPONENT_MAP, NON_PASCAL_CASE_NAMES, WEB_COMPONENT_MAP } from '../../_common/js/components'

const ALL_COMPONENT_MAP = {
  ...WEB_COMPONENT_MAP,
  ...MOBILE_COMPONENT_MAP,
  ...CHAT_COMPONENT_MAP,
}

// 预编译正则
const CAMEL_SPLIT_RE = /([a-z0-9])([A-Z])/g
const MULTI_HYPHEN_RE = /-{2,}/g

// 归一化为 kebab-case（仅支持 kebab/camel/Pascal），用于大小写不敏感比对
function normalizeToKebab(name: string): string {
  if (!name)
    return ''
  return name
    .replace(CAMEL_SPLIT_RE, '$1-$2')
    .replace(MULTI_HYPHEN_RE, '-')
    .toLowerCase()
}

// 将 kebab-case 转为 PascalCase
function kebab2Pascal(kebab: string): string {
  if (!kebab)
    return ''
  return kebab
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

// 预构建归一化别名查找表：直接映射到最终 PascalCase 组件名
// 映射：normalizedAlias -> PascalCase 主组件名
const NORMALIZED_ALIAS_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  Object.entries(ALL_COMPONENT_MAP).forEach(([key, values]) => {
    // 主组件名：优先使用 NON_PASCAL_CASE_NAMES，否则取 values[0]
    const pascalName = NON_PASCAL_CASE_NAMES[key] || values[0]
    const normKey = normalizeToKebab(key)
    map[normKey] = pascalName
    // 允许通过 values 别名命中（大小写/风格不敏感）
    values.forEach((v) => {
      map[normalizeToKebab(v)] = pascalName
    })
  })
  return map
})()

// 提取方括号内容的正则
const BRACKET_RE = /\[(.*?)\]/

// 最终获取 PascalCase 组件名
export function getComponentName(title: string): string | null {
  // 提取方括号里的组件关键词
  const raw = BRACKET_RE.exec(title)?.[1]
  if (!raw)
    return null

  const keyword = normalizeToKebab(raw)
  // 优先从预构建映射获取，否则尝试转换为 PascalCase
  return NORMALIZED_ALIAS_MAP[keyword] || kebab2Pascal(keyword) || null
}
