import { getInput } from '@actions/core';
import { coreInfo, coreSetFailed } from './utils/coreAlias.js';
import { getOctokit } from '@actions/github';
import { issue2Projects } from './projects/issue2Projects.js';

type ProjectType = 'ISSUE2PROJECTS' | 'PRLINKISSUE';

async function run(): Promise<void> {
  try {
    const token =
      getInput('GH_TOKEN') ||
      process.env?.GH_TOKEN ||
      process?.env.GITHUB_TOKEN;
    if (!token) {
      coreSetFailed('GH_TOKEN is not set');
      return;
    }

    const octokit = getOctokit(token);

    const PROJECT_TYPE = getInput('PROJECT_TYPE') as ProjectType;

    if (PROJECT_TYPE === 'ISSUE2PROJECTS') {
      coreInfo('ISSUE2PROJECTS');
      await issue2Projects(octokit);
      return;
    }
    if (PROJECT_TYPE === 'PRLINKISSUE') {
      coreInfo('PRLINKISSUE');
      return;
    }

    coreSetFailed(
      "PROJECT_TYPE is not valid, not 'ISSUE2PROJECTS' or 'PRLINKISSUE'"
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      coreSetFailed(error.message);
    } else {
      coreSetFailed(String(error));
    }
  }
}

run();
