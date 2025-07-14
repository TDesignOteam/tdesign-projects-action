import { context } from '@actions/github';
import { Octokit } from '../types';
import { coreInfo } from '../utils/coreAlias';
import { getProjectV2Items } from '../utils/github/queryProjectV2Items';
import { queryProjectNodeId } from '../utils/github/queryProjectNodeId';
import { getOrgProjectV2 } from '../utils/github/queryOrgProjectV2';

/*
 * @description 只匹配当前仓库的 issue
 */

const extractIssueNumber = (
  extractBody: string,
  owner: string,
  repo: string
): number[] => {
  const issueRegex = /(?:(\w[\w-]*)\/(\w[\w-]*)#(\d+))|#(\d+)/g;

  const issues: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = issueRegex.exec(extractBody)) !== null) {
    if (match[3]) {
      // owner/repo#123 格式
      if (match[1] === owner && match[2] === repo) {
        issues.push(Number(match[3]));
      }
    } else if (match[4]) {
      // #123 格式
      issues.push(Number(match[4]));
    }
  }
  return issues;
};

type PRDetailsQueryResult = {
  repository: {
    pullRequest: {
      title: string;
      body: string;
      commits: {
        nodes: Array<{
          commit: {
            message: string;
          };
        }>;
      };
      reviews: {
        nodes: Array<{
          body: string;
          comments: {
            nodes: Array<{
              body: string;
            }>;
          };
        }>;
      };
      comments: {
        nodes: Array<{
          body: string;
        }>;
      };
    } | null;
  } | null;
};

export const pr2Issue = async (octokit: Octokit) => {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request?.number;

  try {
    const query = `
      query GetPRDetails($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            title
            body
            commits(first: 100) {
              nodes {
                commit {
                  message
                }
              }
            }
            reviews(last: 100) {
              nodes {
                body
                comments(first: 100) {
                  nodes {
                    body
                  }
                }
              }
            }
            comments(first: 100) {
              nodes {
                body
              }
            }
          }
        }
      }
      `;

    const result = await octokit.graphql<PRDetailsQueryResult>(query, {
      owner,
      repo,
      prNumber
    });

    const prResultMessageStr = `
     ${result.repository?.pullRequest?.title || ''}
      ${result.repository?.pullRequest?.body || ''}
      ${result.repository?.pullRequest?.commits.nodes.map((commit) => commit.commit.message).join('\n') || ''}
      ${result.repository?.pullRequest?.reviews.nodes.map((review) => review.body).join('\n') || ''}
      ${result.repository?.pullRequest?.reviews.nodes.flatMap((review) => review.comments.nodes.map((comment) => comment.body)).join('\n') || ''}
      ${result.repository?.pullRequest?.comments.nodes.map((comment) => comment.body).join('\n') || ''}
    `;

    const issues = extractIssueNumber(prResultMessageStr, owner, repo);
    coreInfo(`PR #${prNumber} linked issues: ${issues.join(', ')}`);

    const project = await getOrgProjectV2(octokit, owner, 1);
    const projectNodeId = await queryProjectNodeId(project);

    coreInfo(`Project node id: ${typeof projectNodeId} ${projectNodeId}`);

    let projectItems = await getProjectV2Items(
      octokit,
      owner,
      Number(projectNodeId),
      100
    );

    // 如果有下一页，继续查询
    while (projectItems?.items.pageInfo.hasNextPage) {
      projectItems = await getProjectV2Items(
        octokit,
        'org',
        123,
        100,
        projectItems.items.pageInfo.endCursor
      );
    }

    //  将每个 issue 都在 projects 内查找有没有对应 issue
    projectItems?.items.nodes.forEach((item) => {
      issues.forEach((issue) => {
        if (item.id.includes(`${issue})`)) {
          coreInfo(`Found linked issue #${issue} in project items.`);
        }
      });
    });
  } catch (error) {
    console.error('Failed to get linked issues:', error);
  }
};
