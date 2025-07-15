# tdesign-projects-action

## 项目简介

`tdesign-projects-action` 是一个专门用来供 [TDesgin](https://github.com/Tencent/tdesign) 来管理 Project 的 GitHub Action，用于在项目管理中自动处理 Issue 和 Pull Request（PR）。
通过配置不同的触发器，可以实现以下功能：

1. 根据状态自动将 issue  从 Project 移除。
2. 自动根据 label 的标签变更触发 Project 操作。
3. 自动根据 pr 关联的 issue 触发 Project 操作。

## 在 GitHub Action 中使用

### 1. Issue 触发器

创建 `.github/workflows/project&issueTrigger.yml`，用于在 Issue 关闭时触发, 判断是否要从 Project 移除此 issue。

```yml
name: Project & Issue Trigger Workflow

on:
  issues:
    types: [opened, closed]

jobs:
  project-issue-trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: issue to project
        uses: TDesignOteam/tdesign-projects-action@develop
        env:
          GH_TOKEN: ${{ secrets.GH_PROJECTS }}
          PROJECT_TYPE: ISSUE2TRIGGER
          PROJECT_ID: 4
```

### 2. label 触发器

创建 `.github/workflows/project&labelTrigger.yml`，用于在 Issue 标签变更（添加或移除）时触发，将 Issue 添加到指定的项目并且修改 Project 内的字段状态。

```yml
name: Project & Label Trigger Workflow

on:
  issues:
    types: [labeled, unlabeled]

jobs:
  projects-label-trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: label to project
        uses: TDesignOteam/tdesign-projects-action@develop
        env:
          GH_TOKEN: ${{ secrets.GH_PROJECTS }}
          PROJECT_TYPE: LABEL2TRIGGER
          PROJECT_ID: 4
```

### 3. PR 触发器

创建 `.github/workflows/project&prTrigger.yml`，用于在 PR 打开、重新打开或关闭时触发，将 PR 关联的 issue 进行 Project 管理操作。

```yml
name: Project & PR Trigger Workflow

on:
  pull_request:
    types: [opened, reopened, closed]

jobs:
  project-pr-trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: pr to project
        uses: TDesignOteam/tdesign-projects-action@develop
        env:
          GH_TOKEN: ${{ secrets.GH_PROJECTS }}
          PROJECT_TYPE: PR2TRIGGER
          PROJECT_ID: 4
```

## 发展

如果你有更好的建议将此发展为公共使用，欢迎提 [issue](https://github.com/TDesignOteam/tdesign-projects-action/issues) 讨论。
