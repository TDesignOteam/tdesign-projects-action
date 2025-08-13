import type { Octokit } from '../../../types'

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
