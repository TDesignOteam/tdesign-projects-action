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
    const events = await octokit.paginate(
      octokit.rest.issues.listEventsForTimeline,
      {
        owner,
        repo,
        issue_number: prNumber
      }
    );
    coreInfo(JSON.stringify(events));
  } catch (error) {
    console.error('Failed to get linked issues:', error);
  }
};
