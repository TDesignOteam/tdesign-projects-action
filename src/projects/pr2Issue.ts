import { context } from '@actions/github';
import { Octokit } from '../types';
import { coreError, coreInfo } from '../utils/coreAlias';

export const pr2Issue = async (octokit: Octokit) => {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request?.number;

  if (!prNumber) {
    coreError('pr number is null');
    return;
  }
  try {
    const timeline = await octokit.paginate(
      octokit.rest.issues.listEventsForTimeline,
      {
        owner,
        repo,
        issue_number: prNumber
      }
    );
    coreInfo(`timeline: ${JSON.stringify(timeline, null, 2)}`);

    const linkedIssues = timeline
      .filter(
        (event) =>
          event.event === 'cross-referenced' &&
          'source' in event &&
          event.source?.issue &&
          !event.source.issue.pull_request
      )
      .map((event) => 'source' in event && event.source?.issue?.number);

    coreInfo(`linkedIssues: ${JSON.stringify(linkedIssues, null, 2)}`);
  } catch (error) {
    console.error('Failed to get linked issues:', error);
  }
};
