/**
 * 仓库字段映射
 */
export const repoFields = {
  'tdesign-vue-next': {
    field: 'Vue 3 状态',
    Device: 'Desktop',
  },
  'tdesign-react': {
    field: 'React 状态',
    Device: 'Desktop',
  },
  'tdesign-vue': {
    field: 'Vue 2 状态',
    Device: 'Desktop',
  },
  'tdesign-mobile-vue': {
    field: 'Vue 3 状态',
    Device: 'Mobile',
  },
  'tdesign-mobile-react': {
    field: 'React 状态',
    Device: 'Mobile',
  },
  'tdesign-miniprogram': {
    field: 'MiniProgram 状态',
    Device: 'Mobile',
  },
} as const

/**
 *  仓库 key 类型
 */
export type RepoKey = keyof typeof repoFields

/**
 * 任务字段类型
 */
export const issueFieldType = {
  needToDo: 'need to do',
  inProgress: 'in progress',
  finished: 'finished',
  noPlan: 'no plan',
} as const

export const issueFieldOptions = {
  '🐞 bug': 'Bug',
  '💪🏻 enhancement': 'Feature Request',
  '🐣 new component': 'New Component',
  'question': 'Question',
} as const

/**
 * 主要标签类型
 */
export const LABELS = {
  UNCONFIRMED: '🧐 unconfirmed',
  TO_BE_PUBLISHED: 'to be published',
  BUG: '🐞 bug',
  ENHANCEMENT: '💪🏻 enhancement',
} as const
