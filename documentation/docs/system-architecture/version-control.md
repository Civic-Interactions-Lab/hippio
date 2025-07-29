---
sidebar_position: 7
---

# Version Control

## Overview
We use **Git & GitHub** in a **monorepo** layout containing:  

* **Docusaurus** (documentation)
* **Hungry Hippo Game** 
   * AAC Device (React)
   * Hippo Logic (Phaser + React)
   * WebSocket server

## Branches & Pull Requests
* **Branches**
    * `main` - protected & production-ready
    * `HHP-<Jira-Key>-short-description` - individual work, branched off `main`

* **Pull Request Rules**
    * Require a pull request before merging
        * Requires 1 approval before merging
    * Do not allow bypassing the above settings
    * Must pass PR checks:
        * **GitHub Bot** – All unit tests must pass  
        * **Vercel Deployment** – Deployment must complete successfully  
        * **Vercel Preview Comments** – No unresolved feedback in PR comments

## Testing Requirements
- All pull requests must pass unit tests and include test coverage
- Run tests locally before opening a PR: npm run vitest run --coverage

## Sprint and Issue Tracking
* `Jira` for all sprints, user stories, and tasks 
* Every branch is tied to a Jira ticket, matching the branch name to the ticket for easy tracking 

## Deployments
* **Vercel** auto-deploys main to production on merge
* **Docusaurus** auto-deploys documentation
- **Railway** hosts the **WebSocket server** in production

## Releases
- Use version tags (e.g., `1.0.0, 2.0.0`) for production releases
- Created via GitHub release flow and Jira ticket exports
