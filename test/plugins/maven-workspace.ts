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

import {describe, it, afterEach, beforeEach} from 'mocha';
import * as sinon from 'sinon';
import {MavenWorkspace} from '../../src/plugins/maven-workspace';
import {GitHub} from '../../src/github';
import {ManifestPlugin} from '../../src/plugin';
import {CandidateReleasePullRequest} from '../../src/manifest';
import {
  buildMockCandidatePullRequest,
  buildGitHubFileContent,
  stubFilesFromFixtures,
  safeSnapshot,
} from '../helpers';
import {expect} from 'chai';
import {Update} from '../../src/update';
import {Version} from '../../src/version';
import {PomXml} from '../../src/updaters/java/pom-xml';

const sandbox = sinon.createSandbox();
const fixturesPath = './test/fixtures/plugins/maven-workspace';

describe('MavenWorkspace plugin', () => {
  let github: GitHub;
  let plugin: ManifestPlugin;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'maven-test-repo',
      defaultBranch: 'main',
    });
    plugin = new MavenWorkspace(github, 'main', {
      maven1: {
        releaseType: 'maven',
      },
      maven2: {
        releaseType: 'maven',
      },
      maven3: {
        releaseType: 'maven',
      },
      maven4: {
        releaseType: 'maven',
      },
    });
  });
  afterEach(() => {
    sandbox.restore();
  });
  describe('run', () => {
    it('handles a single maven package', async () => {
      const candidates: CandidateReleasePullRequest[] = [
        buildMockCandidatePullRequest('maven4', 'maven', '4.4.5', 'maven4', [
          buildMockPackageUpdate('maven4/pom.xml', 'maven4/pom.xml', '4.4.5'),
        ]),
      ];
      stubFilesFromFixtures({
        sandbox,
        github,
        fixturePath: fixturesPath,
        files: [
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
        ],
        flatten: false,
        targetBranch: 'main',
      });
      sandbox
        .stub(github, 'findFilesByFilenameAndRef')
        .withArgs('pom.xml', 'main')
        .resolves([
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
        ]);
      const newCandidates = await plugin.run(candidates);
      expect(newCandidates).length(1);
      safeSnapshot(newCandidates[0].pullRequest.body.toString());
      expect(newCandidates[0].pullRequest.body.releaseData).length(1);
    });
    it('appends to existing candidate', async () => {
      const candidates: CandidateReleasePullRequest[] = [
        buildMockCandidatePullRequest('maven3', 'maven', '3.3.4', 'maven3', [
          buildMockPackageUpdate('maven3/pom.xml', 'maven3/pom.xml', '3.3.4'),
        ]),
        buildMockCandidatePullRequest(
          'maven4',
          'maven',
          '4.4.5',
          'maven4',
          [buildMockPackageUpdate('maven4/pom.xml', 'maven4/pom.xml', '4.4.5')],
          '### Dependencies\n\n* Updated foo to v3'
        ),
      ];
      stubFilesFromFixtures({
        sandbox,
        github,
        fixturePath: fixturesPath,
        files: [
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
        ],
        flatten: false,
        targetBranch: 'main',
      });
      sandbox
        .stub(github, 'findFilesByFilenameAndRef')
        .withArgs('pom.xml', 'main')
        .resolves([
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
        ]);
      const newCandidates = await plugin.run(candidates);
      expect(newCandidates).length(1);
      safeSnapshot(newCandidates[0].pullRequest.body.toString());
      expect(newCandidates[0].pullRequest.body.releaseData).length(2);
    });
    it('walks dependency tree and updates previously untouched packages', async () => {
      const candidates: CandidateReleasePullRequest[] = [
        buildMockCandidatePullRequest('maven1', 'maven', '1.1.2', 'maven1', [
          buildMockPackageUpdate('maven1/pom.xml', 'maven1/pom.xml', '1.1.2'),
        ]),
      ];
      stubFilesFromFixtures({
        sandbox,
        github,
        fixturePath: fixturesPath,
        files: [
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
        ],
        flatten: false,
        targetBranch: 'main',
      });
      sandbox
        .stub(github, 'findFilesByFilenameAndRef')
        .withArgs('pom.xml', 'main')
        .resolves([
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
        ]);
      const newCandidates = await plugin.run(candidates);
      expect(newCandidates).length(1);
      safeSnapshot(newCandidates[0].pullRequest.body.toString());
      expect(newCandidates[0].pullRequest.body.releaseData).length(4);
    });
    it('skips pom files not configured for release', async () => {
      sandbox
        .stub(github, 'findFilesByFilenameAndRef')
        .withArgs('pom.xml', 'main')
        .resolves([
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
          'extra/pom.xml',
        ]);
      const candidates: CandidateReleasePullRequest[] = [
        buildMockCandidatePullRequest('maven1', 'maven', '1.1.2', 'maven1', [
          buildMockPackageUpdate('maven1/pom.xml', 'maven1/pom.xml', '1.1.2'),
        ]),
      ];
      stubFilesFromFixtures({
        sandbox,
        github,
        fixturePath: fixturesPath,
        files: [
          'maven1/pom.xml',
          'maven2/pom.xml',
          'maven3/pom.xml',
          'maven4/pom.xml',
        ],
        flatten: false,
        targetBranch: 'main',
      });
      const newCandidates = await plugin.run(candidates);
      expect(newCandidates).length(1);
      safeSnapshot(newCandidates[0].pullRequest.body.toString());
      expect(newCandidates[0].pullRequest.body.releaseData).length(4);
    });
  });
});

function buildMockPackageUpdate(
  path: string,
  fixtureName: string,
  newVersionString: string
): Update {
  const cachedFileContents = buildGitHubFileContent(fixturesPath, fixtureName);
  return {
    path,
    createIfMissing: false,
    cachedFileContents,
    updater: new PomXml(Version.parse(newVersionString)),
  };
}
