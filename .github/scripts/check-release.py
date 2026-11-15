"""Validate the release tag and load public metadata into the current job."""
import json
import os
import re
import sys
from pathlib import Path


def main():
    path = Path(__file__).resolve().parents[2] / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    release_id = manifest["id"]
    name = manifest["name"]
    version = manifest["version"]
    version_code = manifest["versionCode"]
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", release_id):
        raise ValueError("id must be a lowercase identifier with optional hyphens")
    if not name.strip() or not name.isprintable():
        raise ValueError("name must be a nonempty, single-line display name")
    if not re.fullmatch(r"(0|[1-9][0-9]{0,4})(\.(0|[1-9][0-9]{0,4})){2}", version):
        raise ValueError("version must be MAJOR.MINOR.PATCH without leading zeroes")
    parts = tuple(map(int, version.split(".")))
    if not any(parts) or max(parts) > 65535:
        raise ValueError("version must fit Chrome's extension version range")
    if type(version_code) is not int or not 1 <= version_code <= 2_100_000_000:
        raise ValueError("versionCode must be an integer from 1 to 2100000000")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+", manifest["android"]["applicationId"]):
        raise ValueError("invalid android.applicationId")
    tag = f"v{version}"
    if sys.argv[1:] != [tag]:
        raise ValueError(f"the Git tag must be {tag} for manifest version {version}")
    metadata = {
        "RELEASE_TAG": tag,
        "RELEASE_TITLE": f"{name} {tag}",
        "ASSET_PREFIX": f"{release_id}-{tag}",
    }
    # Job outputs can be dropped when public names overlap masked signing secrets.
    # Each job reads the manifest and keeps this metadata in its own environment.
    if output := os.environ.get("GITHUB_ENV"):
        with open(output, "a", encoding="utf-8") as file:
            for key, value in metadata.items():
                print(f"{key}={value}", file=file)
    print(f"Validated release {tag} (Android versionCode {version_code})")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, TypeError, KeyError, AttributeError, OSError) as error:
        sys.exit(f"Release manifest error: {error}")
