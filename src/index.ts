import { env } from 'node:process'
import { getInput } from '@actions/core'
import { getOctokit } from '@actions/github'
import { issueTrigger } from './projects/issueTrigger'
import { labelTrigger } from './projects/labelTrigger'
import { prTrigger } from './projects/prTrigger'
import { coreInfo, coreSetFailed, coreWarning } from './utils/coreAlias'

type ProjectType = 'ISSUE2TRIGGER' | 'PR2TRIGGER' | 'LABEL2TRIGGER'

async function run(): Promise<void> {
  try {
    const token
      = env?.GH_TOKEN
        || getInput('GH_TOKEN')
        || env?.GITHUB_TOKEN
    if (!token) {
      coreSetFailed('GH_TOKEN is not set')
      return
    }

    const octokit = getOctokit(token)

    const PROJECT_TYPE = (env?.PROJECT_TYPE
      || getInput('PROJECT_TYPE')) as ProjectType

    const PROJECT_ID = env?.PROJECT_ID || getInput('PROJECT_ID') || 1

    coreInfo(`PROJECT_TYPE: ${PROJECT_TYPE}`)

    switch (PROJECT_TYPE) {
      case 'LABEL2TRIGGER':
        await labelTrigger(octokit, Number(PROJECT_ID))
        return
      case 'PR2TRIGGER':
        // 如果是包含 'release' 的分支或 base_ref 是 'main'，则不触发 PR 逻辑
        if (
          env?.GITHUB_HEAD_REF?.includes('release')
          || env?.GITHUB_BASE_REF === 'main'
        ) {
          coreWarning(
            `GITHUB_HEAD_REF: ${env?.GITHUB_HEAD_REF}, GITHUB_BASE_REF: ${env?.GITHUB_BASE_REF}, skip PR trigger`,
          )
        }
        else {
          await prTrigger(octokit, Number(PROJECT_ID))
        }
        return
      case 'ISSUE2TRIGGER':
        await issueTrigger(octokit, Number(PROJECT_ID))
        return
      default:
        coreSetFailed(
          'PROJECT_TYPE is not valid, not \'ISSUE2TRIGGER\', \'PR2TRIGGER\', or \'LABEL2TRIGGER\'',
        )
    }
  }
  catch (error: unknown) {
    if (error instanceof Error) {
      coreSetFailed(error.message)
    }
    else {
      coreSetFailed(String(error))
    }
  }
}

run()
