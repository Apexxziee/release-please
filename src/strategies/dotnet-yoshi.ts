// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {BaseStrategy, BuildUpdatesOptions, BaseStrategyOptions} from './base';
import {Update} from '../update';
import {Changelog} from '../updaters/changelog';
import {Apis} from '../updaters/dotnet/apis';
import {logger} from '../util/logger';
import {ConventionalCommit} from '../commit';
import {Version} from '../version';
import {TagName} from '../util/tag-name';
import {Release} from '../release';
import {FileNotFoundError, MissingRequiredFileError} from '../errors';

const CHANGELOG_SECTIONS = [
  {type: 'feat', section: 'New features'},
  {type: 'fix', section: 'Bug fixes'},
  {type: 'perf', section: 'Performance improvements'},
  {type: 'revert', section: 'Reverts'},
  {type: 'chore', section: 'Miscellaneous chores', hidden: true},
  {type: 'docs', section: 'Documentation improvements'},
  {type: 'style', section: 'Styles', hidden: true},
  {type: 'refactor', section: 'Code Refactoring', hidden: true},
  {type: 'test', section: 'Tests', hidden: true},
  {type: 'build', section: 'Build System', hidden: true},
  {type: 'ci', section: 'Continuous Integration', hidden: true},
];
const DEFAULT_CHANGELOG_PATH = 'docs/history.md';
const DEFAULT_PULL_REQUEST_TITLE_PATTERN =
  'Release${component} version ${version}';
const RELEASE_NOTES_HEADER_PATTERN =
  /#{2,3} \[?(\d+\.\d+\.\d+-?[^\]]*)\]?.* \((\d{4}-\d{2}-\d{2})\)/;

interface Api {
  id: string;
  version: string;
  noVersionHistory?: boolean;
  shortName: string;
}
interface ApisJsonConfiguration {
  apis: Api[];
}

export class DotnetYoshi extends BaseStrategy {
  constructor(options: BaseStrategyOptions) {
    options.changelogSections = options.changelogSections ?? CHANGELOG_SECTIONS;
    options.changelogPath = options.changelogPath ?? DEFAULT_CHANGELOG_PATH;
    options.pullRequestTitlePattern =
      options.pullRequestTitlePattern ?? DEFAULT_PULL_REQUEST_TITLE_PATTERN;
    options.includeVInTag = options.includeVInTag ?? false;
    super(options);
  }

  protected async buildReleaseNotes(
    conventionalCommits: ConventionalCommit[],
    newVersion: Version,
    newVersionTag: TagName,
    latestRelease?: Release
  ): Promise<string> {
    const notes = await super.buildReleaseNotes(
      conventionalCommits,
      newVersion,
      newVersionTag,
      latestRelease
    );
    return notes.replace(
      RELEASE_NOTES_HEADER_PATTERN,
      '## Version $1, released $2'
    );
  }

  private async getApi(): Promise<Api | undefined> {
    try {
      const contents = await this.github.getFileContentsOnBranch(
        'apis/apis.json',
        this.targetBranch
      );
      const apis = JSON.parse(contents.parsedContent) as ApisJsonConfiguration;
      const component = await this.getComponent();
      return apis.apis.find(api => api.id === component);
    } catch (e) {
      if (e instanceof FileNotFoundError) {
        throw new MissingRequiredFileError(
          'apis/apis.json',
          DotnetYoshi.name,
          `${this.repository.owner}/${this.repository.repo}`
        );
      }
      throw e;
    }
  }

  protected async buildUpdates(
    options: BuildUpdatesOptions
  ): Promise<Update[]> {
    const updates: Update[] = [];
    const version = options.newVersion;
    const component = await this.getComponent();

    const api = await this.getApi();
    if (api?.noVersionHistory) {
      logger.info(
        `Skipping changelog for ${component} via noVersionHistory configuration`
      );
    } else {
      updates.push({
        path: this.addPath(this.changelogPath),
        createIfMissing: true,
        updater: new Changelog({
          version,
          changelogEntry: options.changelogEntry,
        }),
      });
    }

    if (!this.component) {
      logger.warn(
        'Dotnet strategy expects to use components, could not update all files'
      );
      return updates;
    }

    updates.push({
      path: 'apis/apis.json',
      createIfMissing: false,
      updater: new Apis(this.component, version),
    });

    return updates;
  }
}
