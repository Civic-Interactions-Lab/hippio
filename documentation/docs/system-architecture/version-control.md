---
sidebar_position: 6
---

# Version Control

## Overview
We use **Git & GitHub** in a **monorepo** layout containing:  

* **Docusaurus** (documentation)
* **Hungry Hippo Game** 
   * AAC Device
   * Hippo Logic (Phaser + React)
   * WebSocket server
   * Firebase Realtime Database

## Branches & Pull Requests
* **Branches**
    * `main` - protected & production-ready
    * `HHP-<Jira-Key>-short-description` - individual work, branched off `main`

* **Pull Request Rules**
    * Require a pull request before merging
        * Requires 1 approval before merging
    * Do not allow bypassing the above settings

## Sprint and Issue Tracking
* `Jira` for all sprints, user stories, and tasks 
* Every branch is tied to a Jira ticket, matching the branch name to the ticket for easy tracking

## Deployments
* **Vercel** auto-deploys main to production on merge
* **Docusaurus** auto-deploys documentation
