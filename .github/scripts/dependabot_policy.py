"""Decide whether a verified Dependabot PR can merge after its CI succeeds."""

import json
import os
import re
import sys


ACTIONS = {
    "actions/checkout", "actions/setup-node",
    "actions/upload-pages-artifact", "actions/deploy-pages",
}
ROOT_MANIFESTS = {"package.json", "package-lock.json"}


def action_bump(update, files):
    name = update["dependencyName"]
    if name not in ACTIONS or len(files) != 1:
        return False
    file = files[0]
    if file["filename"] != ".github/workflows/check.yml":
        return False

    # Every edited line must be a version replacement in the same step.
    old = update["prevVersion"].removeprefix("v")
    new = update["newVersion"].removeprefix("v")
    if not all(re.fullmatch(r"\d+(?:\.\d+){0,2}", v) for v in (old, new)) or old == new:
        return False
    patch = file.get("patch", "").splitlines()
    edits = [i for i, line in enumerate(patch) if line.startswith(("-", "+"))]
    removed = [i for i in edits if patch[i].startswith("-")]
    if not removed or len(edits) != 2 * len(removed) or file["changes"] != len(edits):
        return False
    for i in removed:
        line = patch[i][1:]
        if not re.fullmatch(r"\s*(?:- )?uses: " + re.escape(f"{name}@v{old}"), line):
            return False
        if i + 1 >= len(patch) or patch[i + 1] != "+" + line.removesuffix(old) + new:
            return False
    return True


def eligible(updates, files):
    if not updates or not files or any(f["status"] != "modified" for f in files):
        return False
    if len(updates) == 1 and updates[0]["packageEcosystem"] == "github_actions":
        return action_bump(updates[0], files)
    if any(u["packageEcosystem"] != "npm_and_yarn" for u in updates):
        return False
    if any(u["dependencyName"] == "@types/node" and
           not re.fullmatch(r"24\.\d+\.\d+", u["newVersion"]) for u in updates):
        return False

    groups = {u["dependencyGroup"] for u in updates}
    paths = {f["filename"] for f in files}
    if groups in ({"parse5-security"}, {"npm-security"}):
        return paths <= ROOT_MANIFESTS | {"packages/paste-lab/package.json"}
    return groups == {"dev-patches"} and paths <= ROOT_MANIFESTS and all(
        u["dependencyType"] == "direct:development"
        and u["updateType"] == "version-update:semver-patch"
        and u["dependencyName"] != "parse5" for u in updates
    )


if __name__ == "__main__":
    files = json.load(sys.stdin)
    allowed = len(files) == int(os.environ["FILE_COUNT"]) and eligible(
        json.loads(os.environ["UPDATES"]), files
    )
    print("eligible=" + str(allowed).lower())
