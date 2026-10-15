"""Isolated archive reader. Never runs archived code or connects any service."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tarfile
import unicodedata


class Refused(Exception):
    pass


def require(condition):
    if not condition:
        raise Refused("Archive or destination refused")


def integer(value, minimum=0):
    return type(value) is int and value >= minimum


def safe_name(value, directory=False):
    require(type(value) is str and len(value.encode("utf-8")) <= 4096)
    if directory and value.endswith("/"):
        value = value[:-1]
    pieces = value.split("/")
    require(value and len(pieces) <= 12 and not value.startswith("/") and "\\" not in value)
    require(not any(ord(char) < 32 or ord(char) == 127 for char in value))
    require(not any(piece in ("", ".", "..") for piece in pieces))
    return value


def hash_ok(value):
    return type(value) is str and re.fullmatch(r"[a-f0-9]{64}", value) is not None


class BoundedReader:
    """Refuse unbounded/huge metadata allocations by the tar parser."""
    def __init__(self, source, size, max_entries):
        self.source, self.size = source, size
        self.metadata_phase, self.extra_metadata, self.header_reads = True, 0, 0
        self.max_header_reads = max_entries * 8

    def read(self, size=-1):
        require(integer(size) and size <= 16 * 1024 * 1024)
        if self.metadata_phase:
            if size > 512:
                self.extra_metadata += size
                require(self.extra_metadata <= 64 * 1024 * 1024)
            else:
                self.header_reads += 1
                require(self.header_reads <= self.max_header_reads)
        return self.source.read(size)

    def tell(self):
        return self.source.tell()

    def seek(self, offset, whence=os.SEEK_SET):
        position = offset if whence == os.SEEK_SET else (
            self.tell() + offset if whence == os.SEEK_CUR else self.size + offset)
        require(0 <= position <= self.size)
        return self.source.seek(offset, whence)


def private_directory(path):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and info.st_mode & 0o077 == 0)
    require(path.resolve() == path)


def read_json(archive, member):
    require(member.isfile() and 0 < member.size <= 64 * 1024 * 1024)
    with archive.extractfile(member) as source:
        chunks, size = [], 0
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            require(size <= member.size)
            chunks.append(chunk)
    require(size == member.size)
    value = json.loads(b"".join(chunks).decode("utf-8"))
    require(type(value) is dict)
    return value


def inspect_components(archive, members, backup_id):
    require("bundle.json" in members and not members["bundle.json"].isdir())
    bundle = read_json(archive, members["bundle.json"])
    require(bundle.get("format") == "novasite-scheduled-backup-v1" and bundle.get("id") == backup_id)
    require(bundle.get("layout") == "database-and-media-component-subdirectories")
    require(bundle.get("maintenanceWindowConfirmed") is False and bundle.get("databaseConsistency") == "not-verified")
    require(bundle.get("coverage") == "business-database-and-current-media-not-environment-secrets")
    expected, component_paths, details = {}, {}, {}
    for kind in ("database", "media"):
        component = bundle.get(kind)
        require(type(component) is dict)
        path = safe_name(component.get("relativeDirectory"))
        require(len(path.split("/")) == 2 and path.split("/")[0] == kind)
        require(path in members and members[path].isdir())
        manifest_path = path + "/manifest.json"
        require(manifest_path in members)
        manifest = read_json(archive, members[manifest_path])
        require(manifest.get("id") == component.get("id") and type(manifest.get("id")) is str)
        require(re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", manifest["id"]))
        component_paths[kind] = path
        if kind == "database":
            require(manifest.get("format") == "novasite-database-backup-v1" and manifest.get("state") == "backup-created")
            value = manifest.get("archive", {})
            require(type(value) is dict and value.get("file") == "database.dump" and value.get("format") == "custom")
            require(integer(value.get("bytes"), 5) and hash_ok(value.get("sha256")))
            require(value["bytes"] == component.get("bytes") and value["sha256"] == component.get("sha256"))
            require(manifest.get("coverage", {}).get("database") == "all-non-system-schemas")
            expected[path + "/database.dump"] = {"bytes": value["bytes"], "sha256": value["sha256"]}
            details[kind] = {"id": manifest["id"], "bytes": value["bytes"], "sourceDatabase": manifest.get("source", {}).get("database"),
                             "toolMajor": manifest.get("tool", {}).get("major")}
        else:
            require(manifest.get("format") == "novasite-media-live-copy-v1" and manifest.get("state") == "live-file-copy-created")
            require(manifest.get("maintenanceWindowConfirmed") is False and manifest.get("fileInventoryUnchangedDuringCopy") is True)
            require(manifest.get("source", {}).get("mode") in ("local", "s3-versioned"))
            objects, originals, blobs, total = manifest.get("objects"), set(), set(), 0
            require(type(objects) is list and len(objects) <= len(members))
            for item in objects:
                require(type(item) is dict and integer(item.get("bytes")) and hash_ok(item.get("sha256")))
                original = safe_name(item.get("path"))
                blob = item.get("archive")
                require(type(blob) is str and re.fullmatch(r"objects/\d{8}\.bin", blob))
                require(original not in originals and blob not in blobs)
                originals.add(original); blobs.add(blob); total += item["bytes"]
                expected[path + "/" + blob] = {"bytes": item["bytes"], "sha256": item["sha256"]}
            totals = manifest.get("totals", {})
            require(totals.get("files") == len(objects) == component.get("files"))
            require(totals.get("bytes") == total == component.get("bytes"))
            details[kind] = {"id": manifest["id"], "files": len(objects), "bytes": total, "sourceState": manifest["state"]}
    for name, member in members.items():
        require(name in ("database", "media", "bundle.json") or any(
            name == prefix or name.startswith(prefix + "/") for prefix in component_paths.values()))
        if name in ("database", "media"):
            require(member.isdir())
    for name, value in expected.items():
        require(name in members and members[name].isfile() and members[name].size == value["bytes"])
    return component_paths, expected, details


def same_file(left, right):
    return (left.st_dev, left.st_ino, left.st_size, left.st_mtime_ns, left.st_ctime_ns) == (
        right.st_dev, right.st_ino, right.st_size, right.st_mtime_ns, right.st_ctime_ns)


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def main():
    require(sys.version_info >= (3, 12) and os.name == "posix" and len(sys.argv) == 9)
    archive_path, destination = Path(sys.argv[1]), Path(sys.argv[2])
    backup_id, expected_hash = sys.argv[3], sys.argv[4]
    max_bytes, max_entries, max_file_bytes = map(int, sys.argv[5:8])
    report_path = Path(sys.argv[8])
    require(archive_path.is_absolute() and destination.is_absolute() and report_path.is_absolute())
    private_directory(destination.parent)
    require(report_path.parent == destination.parent and not report_path.exists())
    require(not destination.exists() and not destination.is_symlink())
    require(hash_ok(expected_hash) and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", backup_id))
    before = archive_path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_mode & 0o077 == 0 and archive_path.resolve() == archive_path)
    require(0 < before.st_size <= max_bytes)
    descriptor = os.open(archive_path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        require(same_file(before, os.fstat(source.fileno())))
        digest = hashlib.sha256()
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
        require(digest.hexdigest() == expected_hash and same_file(before, os.fstat(source.fileno())))
        source.seek(0)
        reader = BoundedReader(source, before.st_size, max_entries)
        with tarfile.open(fileobj=reader, mode="r:") as archive:
            members, normalized, total = {}, set(), 0
            for member in archive:
                require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE) and member.sparse is None)
                name = safe_name(member.name, member.isdir())
                normalized_name = unicodedata.normalize("NFC", name).casefold()
                require(name not in members and normalized_name not in normalized and len(members) < max_entries)
                require(name.split("/")[0] in ("database", "media", "bundle.json"))
                require(integer(member.size) and member.size <= max_file_bytes)
                require(member.offset_data + member.size <= before.st_size)
                require(not member.isdir() or member.size == 0)
                total += member.size
                require(total <= max_bytes)
                members[name] = member; normalized.add(normalized_name)
            require(members)
            reader.metadata_phase = False
            for name in members:
                parts = name.split("/")
                for index in range(1, len(parts)):
                    parent = "/".join(parts[:index])
                    require(parent in members and members[parent].isdir())
            paths, expected, details = inspect_components(archive, members, backup_id)
            require(same_file(before, os.fstat(source.fileno())) and same_file(before, archive_path.lstat()))
            # Preflight finishes before creating the output tree. No extractall(), links or archived permissions.
            destination.mkdir(mode=0o700)
            directories = [destination]
            for name, member in sorted(members.items(), key=lambda pair: (pair[0].count("/"), pair[0])):
                target = destination.joinpath(*name.split("/"))
                require(target.parent.resolve().is_relative_to(destination))
                if member.isdir():
                    target.mkdir(mode=0o700); directories.append(target)
                    continue
                digest, copied = hashlib.sha256(), 0
                descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(descriptor, "wb") as output, archive.extractfile(member) as content:
                    while chunk := content.read(1024 * 1024):
                        copied += len(chunk)
                        require(copied <= member.size)
                        output.write(chunk); digest.update(chunk)
                    output.flush(); os.fsync(output.fileno())
                require(copied == member.size)
                if name in expected:
                    require(digest.hexdigest() == expected[name]["sha256"])
                if name == paths["database"] + "/database.dump":
                    with target.open("rb") as saved:
                        require(saved.read(5) == b"PGDMP")
            require(same_file(before, os.fstat(source.fileno())) and same_file(before, archive_path.lstat()))
            for directory in reversed(directories):
                sync_directory(directory)
            sync_directory(destination.parent)
    report = {"format": "novasite-unpacked-backup-v1", "state": "components-extracted-and-hash-checked",
              "id": backup_id, "relativeComponentPaths": paths, "components": details,
              "entries": len(members), "bytes": total, "plaintextSHA256": expected_hash,
              "databaseConsistency": "not-verified", "restoreRehearsal": "not-run",
              "databaseRestored": False, "originalMediaWritten": False}
    descriptor = os.open(report_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        json.dump(report, output, ensure_ascii=False, indent=2); output.write("\n")
        output.flush(); os.fsync(output.fileno())
    sync_directory(report_path.parent)


if __name__ == "__main__":
    os.umask(0o077)
    try:
        main()
    except Exception:
        # Never leak archive names, contents, keys or a Python traceback into public logs.
        print("Private backup unpack refused or interrupted; no production restore was attempted.", file=sys.stderr)
        sys.exit(1)
