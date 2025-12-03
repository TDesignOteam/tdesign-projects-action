import type { Octokit } from '../../../types'

/**
 * 更新 GitHub Project V2 中单选字段的值
 * @param octokit - Octokit 实例
 * @param projectNodeId - 项目节点 ID
 * @param itemId - 项目项 ID
 * @param fieldId - 字段 ID
 * @param value - {singleSelectOptionId: string | null}
 * @param value.singleSelectOptionId - 单选选项 ID(选项只根据 ID 更新)
 */
export function updateSingleSelectOptionField(octokit: Octokit, projectNodeId: string | null, itemId: string, fieldId: string, value: { singleSelectOptionId: string | null }) {
  return octokit.graphql(
    `
      mutation UpdateField(
        $projectId: ID!,
        $itemId: ID!,
        $fieldId: ID!,
        $value: ProjectV2FieldValue!
      ) {
        updateProjectV2ItemFieldValue(
          input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }
        ) {
          projectV2Item { id }
        }
      }
    `,
    {
      projectId: projectNodeId,
      itemId,
      fieldId,
      value,
    },
  )
}
