import unittest

from dependabot_policy import eligible


class MergePolicyTest(unittest.TestCase):
    def test_actions_only_accept_a_ref_change_in_the_existing_step(self):
        update = {"dependencyName": "actions/checkout", "packageEcosystem": "github_actions",
                  "prevVersion": "6", "newVersion": "7"}
        patch = "-      - uses: actions/checkout@v6\n+      - uses: actions/checkout@v7"
        file = {"filename": ".github/workflows/check.yml", "status": "modified", "changes": 2,
                "patch": patch}
        self.assertTrue(eligible([update], [file]))
        for change in ({"changes": 3}, {"patch": patch.replace("+      ", "+  ")},
                       {"patch": patch + "\n+        if: always()"}, {"patch": ""},
                       {"filename": ".github/workflows/dependabot-merge.yml"}):
            self.assertFalse(eligible([update], [file | change]))

    def test_security_groups_and_routine_updates(self):
        workspace = {"filename": "packages/paste-lab/package.json", "status": "modified"}
        lock = {"filename": "package-lock.json", "status": "modified"}
        update = {"dependencyName": "parse5", "packageEcosystem": "npm_and_yarn",
                  "updateType": "version-update:semver-major", "dependencyType": "direct:production",
                  "dependencyGroup": "parse5-security"}
        self.assertTrue(eligible([update], [workspace, lock]))
        self.assertFalse(eligible([update | {"dependencyGroup": ""}], [workspace, lock]))
        transitive = update | {"dependencyName": "example", "dependencyGroup": "npm-security",
                               "dependencyType": "indirect"}
        self.assertTrue(eligible([transitive], [lock]))
        self.assertFalse(eligible([transitive], [lock, workspace | {"filename": "src/app.ts"}]))
        types = transitive | {"dependencyName": "@types/node", "newVersion": "26.6.6"}
        self.assertFalse(eligible([transitive, types], [lock]))
        patch = types | {"newVersion": "24.19.5", "dependencyGroup": "dev-patches",
                         "dependencyType": "direct:development", "updateType": "version-update:semver-patch"}
        self.assertTrue(eligible([patch], [lock]))
        self.assertFalse(eligible([patch | {"updateType": "version-update:semver-minor"}], [lock]))
