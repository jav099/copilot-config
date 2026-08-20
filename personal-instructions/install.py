#!/usr/bin/env python3

import argparse
import errno
import os
import sys
import uuid
from pathlib import Path


def symlink_error_message(error):
    if os.name == "nt" and (
        getattr(error, "winerror", None) == 1314 or error.errno == errno.EPERM
    ):
        return (
            "symlink creation is not permitted; enable Windows Developer Mode "
            "or run this command in an elevated terminal"
        )
    return str(error)


def replace_symlink(source, destination):
    temporary = destination.with_name(
        ".{}.{}.tmp".format(destination.name, uuid.uuid4().hex)
    )
    try:
        temporary.symlink_to(source)
        os.replace(str(temporary), str(destination))
    finally:
        if temporary.is_symlink() or temporary.exists():
            temporary.unlink()


def install_for_repository(repository, sources):
    repository = repository.expanduser().resolve()
    if not repository.is_dir():
        print("FAILED    {}: repository root is not a directory".format(repository))
        return False

    destination_dir = repository / ".github" / "instructions"
    try:
        destination_dir.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        print(
            "FAILED    {}: cannot create destination directory: {}".format(
                destination_dir, error
            )
        )
        return False

    succeeded = True
    for source in sources:
        destination = destination_dir / source.name

        if destination.is_symlink():
            if os.readlink(str(destination)) == str(source):
                print("UNCHANGED {} -> {}".format(destination, source))
                continue

            try:
                replace_symlink(source, destination)
            except OSError as error:
                print(
                    "FAILED    {}: {}".format(
                        destination, symlink_error_message(error)
                    )
                )
                succeeded = False
            else:
                print("UPDATED   {} -> {}".format(destination, source))
            continue

        if destination.exists():
            print(
                "FAILED    {}: non-symlink path exists; refusing to overwrite".format(
                    destination
                )
            )
            succeeded = False
            continue

        try:
            destination.symlink_to(source)
        except OSError as error:
            print(
                "FAILED    {}: {}".format(
                    destination, symlink_error_message(error)
                )
            )
            succeeded = False
        else:
            print("CREATED   {} -> {}".format(destination, source))

    return succeeded


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Install personal instruction files into repository checkouts."
    )
    parser.add_argument(
        "repositories",
        nargs="+",
        metavar="REPOSITORY",
        type=Path,
        help="repository root to process",
    )
    args = parser.parse_args(argv)

    script_dir = Path(__file__).resolve().parent
    sources = sorted(
        candidate.resolve()
        for candidate in script_dir.glob("*.instructions.md")
        if candidate.is_file()
    )
    if not sources:
        print(
            "FAILED    {}: no *.instructions.md files found".format(script_dir),
            file=sys.stderr,
        )
        return 1

    succeeded = True
    for repository in args.repositories:
        if not install_for_repository(repository, sources):
            succeeded = False

    return 0 if succeeded else 1


if __name__ == "__main__":
    sys.exit(main())
