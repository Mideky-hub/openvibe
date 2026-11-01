//! The Code studio's files (spec studio code §4): read and written by hand,
//! never outside the project, never over what an agent wrote meanwhile.

use crate::tr;
use std::collections::BTreeSet;
use std::hash::{DefaultHasher, Hasher};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use uuid::Uuid;

use crate::process::hide_window;

/// A file over this is neither opened nor saved.
pub const MAX_BYTES: u64 = 2 * 1024 * 1024;
/// A folder of thousands of generated files must not freeze the tree.
pub const MAX_FILES: usize = 50_000;
/// Outside a repository nothing says what is generated or private: these are not walked.
const SKIPPED_FOLDERS: [&str; 6] = [".git", "node_modules", "target", ".ssh", ".aws", ".gnupg"];
/// Private keys and stores, by extension.
const SECRET_EXTENSIONS: [&str; 7] = ["pem", "key", "p12", "pfx", "keystore", "jks", "ppk"];
/// Private keys and credentials, by name.
const SECRET_NAMES: [&str; 9] = [
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    "credentials.json",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub text: String,
    /// What was read, to be given back when saving.
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum WriteOutcome {
    Saved {
        version: String,
    },
    /// Nothing was written; `disk` is what is there now, None when the file is gone.
    Conflict {
        disk: Option<String>,
    },
}

fn refused(file: &str) -> String {
    tr!("chemin refusé : {file}", "path refused: {file}")
}

fn not_found(file: &str) -> String {
    tr!("fichier introuvable : {file}", "file not found: {file}")
}

fn too_big(file: &str) -> String {
    tr!(
        "fichier trop gros (2 Mo au plus) : {file}",
        "file too big (2 MB at most): {file}"
    )
}

fn binary(file: &str) -> String {
    tr!("fichier binaire : {file}", "binary file: {file}")
}

fn is_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    let numbered = (stem.starts_with("COM") || stem.starts_with("LPT"))
        && stem.len() == 4
        && stem.ends_with(|c: char| c.is_ascii_digit());
    numbered || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
}

/// Whether Windows would take `name` as it is. A `:` is a drive or an NTFS
/// stream, and a final dot or space is dropped, so `.git.` would be `.git`.
/// This also leaves out `.`, `..` and the empty name of a root.
pub(crate) fn is_plain_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(':') && !name.ends_with(['.', ' ']) && !is_device_name(name)
}

/// The file's real path, which may not exist yet; whatever leaves `root` or
/// reaches a `.git` is refused, through links and junctions too.
pub(crate) fn resolve(root: &Path, file: &str) -> Result<PathBuf, String> {
    if !file.split(['/', '\\']).all(is_plain_name) {
        return Err(refused(file));
    }
    let base = std::fs::canonicalize(root).map_err(|err| err.to_string())?;
    let mut existing = base.join(file);
    let mut missing = Vec::new();
    // The closest ancestor that exists is where a new file would really land.
    let mut real = loop {
        match std::fs::canonicalize(&existing) {
            Ok(real) => break real,
            Err(err) if err.kind() == ErrorKind::NotFound => {
                // A broken link is there, but leads nowhere.
                if existing.symlink_metadata().is_ok() {
                    return Err(refused(file));
                }
                let name = existing.file_name().ok_or_else(|| refused(file))?;
                missing.push(name.to_os_string());
                existing.pop();
            }
            Err(_) => return Err(refused(file)),
        }
    };
    real.extend(missing.iter().rev());
    let inside = real.strip_prefix(&base).map_err(|_| refused(file))?;
    if inside
        .components()
        .any(|c| c.as_os_str().eq_ignore_ascii_case(".git"))
    {
        return Err(refused(file));
    }
    Ok(real)
}

fn version_of(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    hasher.write(bytes);
    format!("{}-{:016x}", bytes.len(), hasher.finish())
}

/// At most one byte over the limit: the file may grow after its size was read.
fn read_bounded(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// What is at `path` now, None when nothing is. A file over the limit is known
/// by its size alone: this runs every 2 s.
fn disk_version(path: &Path, file: &str) -> Result<Option<String>, String> {
    let meta = match std::fs::metadata(path) {
        Ok(meta) => meta,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    if !meta.is_file() {
        return Err(refused(file));
    }
    let over = || format!("over-{}", meta.len());
    if meta.len() > MAX_BYTES {
        return Ok(Some(over()));
    }
    match read_bounded(path) {
        Ok(bytes) if bytes.len() as u64 > MAX_BYTES => Ok(Some(over())),
        Ok(bytes) => Ok(Some(version_of(&bytes))),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Written beside it, then renamed: nobody ever reads a half-written file.
fn replace(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let folder = path.parent().ok_or(ErrorKind::NotFound)?;
    let permissions = std::fs::metadata(path).ok().map(|m| m.permissions());
    let temporary = folder.join(format!(".openvibe-{}.tmp", Uuid::new_v4()));
    let written = (|| {
        let mut file = std::fs::File::create(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        if let Some(permissions) = permissions {
            std::fs::set_permissions(&temporary, permissions)?;
        }
        std::fs::rename(&temporary, path)
    })();
    if written.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    written
}

fn listed_by_git(root: &Path) -> Option<String> {
    let output = hide_window(
        Command::new("git")
            .arg("--no-optional-locks")
            .args(["-c", "core.quotePath=false"])
            .arg("-C")
            .arg(root)
            .args(["ls-files", "-co", "--exclude-standard", "-z"]),
    )
    .output()
    .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Without a `.gitignore` to hide them, these would sit in the tree in plain sight.
fn is_secret(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    let extension = Path::new(&name).extension().and_then(|e| e.to_str());
    name.starts_with(".env")
        || SECRET_NAMES.contains(&name.as_str())
        || extension.is_some_and(|e| SECRET_EXTENSIONS.contains(&e))
}

/// The files of a folder that is no repository; links are not followed.
fn walk(root: &Path) -> Result<Vec<String>, String> {
    let mut found = BTreeSet::new();
    let mut folders = vec![String::new()];
    while let Some(folder) = folders.pop() {
        let entries = match std::fs::read_dir(root.join(&folder)) {
            Ok(entries) => entries,
            Err(err) if folder.is_empty() => return Err(err.to_string()),
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            if found.len() == MAX_FILES {
                return Ok(found.into_iter().collect());
            }
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = if folder.is_empty() {
                name.clone()
            } else {
                format!("{folder}/{name}")
            };
            if kind.is_file() {
                if !is_secret(&name) {
                    found.insert(path);
                }
            } else if kind.is_dir() && !SKIPPED_FOLDERS.contains(&name.as_str()) {
                folders.push(path);
            }
        }
    }
    Ok(found.into_iter().collect())
}

/// The project's files, tracked or not, without ignored ones; paths from `root`.
/// Run in `root`, not at the repository's top: the project may be a subfolder.
pub fn files(root: &Path) -> Result<Vec<String>, String> {
    let Some(listed) = listed_by_git(root) else {
        return walk(root);
    };
    let unique: BTreeSet<&str> = listed.split('\0').filter(|p| !p.is_empty()).collect();
    Ok(unique
        .into_iter()
        // `ls-files -c` still names a tracked file that was deleted.
        .filter(|file| root.join(file).is_file())
        .take(MAX_FILES)
        .map(str::to_string)
        .collect())
}

/// A text file of `root`. What is not valid UTF-8 is refused rather than read
/// lossily: saving it back would corrupt it.
pub fn read(root: &Path, file: &str) -> Result<OpenedFile, String> {
    let path = resolve(root, file)?;
    let meta = std::fs::metadata(&path).map_err(|_| not_found(file))?;
    if !meta.is_file() {
        return Err(refused(file));
    }
    if meta.len() > MAX_BYTES {
        return Err(too_big(file));
    }
    let bytes = read_bounded(&path).map_err(|err| err.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(too_big(file));
    }
    if bytes.contains(&0) {
        return Err(binary(file));
    }
    let version = version_of(&bytes);
    let text = String::from_utf8(bytes)
        .map_err(|_| tr!("fichier non UTF-8 : {file}", "file not in UTF-8: {file}"))?;
    Ok(OpenedFile { text, version })
}

/// The file's version on the disk; None when it no longer exists.
pub fn version(root: &Path, file: &str) -> Result<Option<String>, String> {
    disk_version(&resolve(root, file)?, file)
}

/// Writes `text` if the disk still holds `expected` (None: no file). There is
/// no way to force it: overwriting is writing against the version seen, so one
/// more change is one more conflict (spec studio code §3).
pub fn write(
    root: &Path,
    file: &str,
    text: &str,
    expected: Option<&str>,
) -> Result<WriteOutcome, String> {
    if text.len() as u64 > MAX_BYTES {
        return Err(too_big(file));
    }
    if text.contains('\0') {
        return Err(binary(file));
    }
    let path = resolve(root, file)?;
    let disk = disk_version(&path, file)?;
    if disk.as_deref() != expected {
        return Ok(WriteOutcome::Conflict { disk });
    }
    // Said plainly, rather than leaving it to what the rename makes of it.
    if std::fs::metadata(&path).is_ok_and(|m| m.permissions().readonly()) {
        return Err(tr!(
            "fichier en lecture seule : {file}",
            "read-only file: {file}"
        ));
    }
    replace(&path, text.as_bytes()).map_err(|err| err.to_string())?;
    Ok(WriteOutcome::Saved {
        version: version_of(text.as_bytes()),
    })
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use tempfile::TempDir;

    use super::*;

    fn project(files: &[(&str, &[u8])]) -> TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (name, bytes) in files {
            let path = dir.path().join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, bytes).unwrap();
        }
        dir
    }

    fn git(dir: &Path, args: &[&str]) -> bool {
        Command::new("git")
            .arg("-C")
            .arg(dir)
            .args([
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "-c",
                "commit.gpgsign=false",
            ])
            .args(args)
            .output()
            .is_ok_and(|output| output.status.success())
    }

    /// A junction needs no privilege, unlike a symbolic link: this test always runs.
    #[cfg(windows)]
    fn junction(link: &Path, target: &Path) {
        let done = Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .unwrap();
        assert!(done.status.success(), "{done:?}");
    }

    fn version_of_disk(root: &Path, file: &str) -> String {
        version(root, file).unwrap().unwrap()
    }

    #[test]
    fn refuses_paths_that_leave_the_project_by_their_shape() {
        let dir = project(&[("a.txt", b"x"), ("sub/b.txt", b"y")]);
        for file in [
            "",
            "..",
            "../a.txt",
            "sub/../a.txt",
            "sub/../../a.txt",
            "./a.txt",
            "sub/./b.txt",
            "/a.txt",
            "\\a.txt",
            "C:/Windows/win.ini",
            "C:\\Windows\\win.ini",
            "C:a.txt",
            "\\\\server\\share\\a.txt",
            "a.txt:stream",
            "sub/b.txt::$DATA",
            "NUL",
            "con.txt",
            "sub/COM1",
            "a.txt.",
            "a.txt ",
        ] {
            assert!(read(dir.path(), file).is_err(), "read {file:?}");
            assert!(version(dir.path(), file).is_err(), "version {file:?}");
            assert!(
                write(dir.path(), file, "z", None).is_err(),
                "write {file:?}"
            );
        }
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"x");
    }

    #[test]
    fn refuses_a_message_in_the_interface_language() {
        let dir = project(&[]);
        assert_eq!(
            read(dir.path(), "../a").unwrap_err(),
            "chemin refusé : ../a"
        );
        assert_eq!(
            crate::i18n::in_english(|| read(dir.path(), "../a").unwrap_err()),
            "path refused: ../a"
        );
    }

    #[test]
    fn refuses_the_git_folder_at_any_depth_and_in_any_case() {
        let dir = project(&[
            (".git/config", b"x"),
            (".GIT/hooks/pre-commit", b"x"),
            ("sub/.git/config", b"x"),
        ]);
        for file in [
            ".git/config",
            ".GIT/config",
            ".Git/hooks/pre-commit",
            ".git/hooks/new",
            "sub/.git/config",
        ] {
            assert!(read(dir.path(), file).is_err(), "read {file:?}");
            assert!(
                write(dir.path(), file, "z", None).is_err(),
                "write {file:?}"
            );
        }
        assert_eq!(std::fs::read(dir.path().join(".git/config")).unwrap(), b"x");
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_junction_that_leaves_the_project() {
        let outside = project(&[("secret.txt", b"secret")]);
        let dir = project(&[]);
        junction(&dir.path().join("link"), outside.path());
        assert!(read(dir.path(), "link/secret.txt").is_err());
        assert!(version(dir.path(), "link/secret.txt").is_err());
        let known = version_of_disk(outside.path(), "secret.txt");
        assert!(write(dir.path(), "link/secret.txt", "z", Some(&known)).is_err());
        assert!(write(dir.path(), "link/new.txt", "z", None).is_err());
        assert_eq!(
            std::fs::read(outside.path().join("secret.txt")).unwrap(),
            b"secret"
        );
        assert!(!outside.path().join("new.txt").exists());
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_junction_to_the_git_folder() {
        let dir = project(&[(".git/config", b"x")]);
        junction(&dir.path().join("link"), &dir.path().join(".git"));
        assert!(read(dir.path(), "link/config").is_err());
        assert!(write(dir.path(), "link/config", "z", None).is_err());
        assert_eq!(std::fs::read(dir.path().join(".git/config")).unwrap(), b"x");
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_dangling_link() {
        let gone = project(&[]);
        let dir = project(&[]);
        let target = gone.path().join("target");
        std::fs::create_dir(&target).unwrap();
        junction(&dir.path().join("link"), &target);
        std::fs::remove_dir(&target).unwrap();
        assert!(version(dir.path(), "link").is_err());
        assert!(write(dir.path(), "link", "z", None).is_err());
        assert!(write(dir.path(), "link/new.txt", "z", None).is_err());
        assert!(!target.exists());
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_symbolic_link_that_leaves_the_project_but_follows_one_inside() {
        let outside = project(&[("secret.txt", b"secret")]);
        let dir = project(&[("real.txt", b"real")]);
        let link = dir.path().join("out.txt");
        // Creating one takes a privilege or the developer mode.
        if std::os::windows::fs::symlink_file(outside.path().join("secret.txt"), &link).is_err() {
            return;
        }
        assert!(read(dir.path(), "out.txt").is_err());
        assert!(write(dir.path(), "out.txt", "z", None).is_err());
        assert_eq!(
            std::fs::read(outside.path().join("secret.txt")).unwrap(),
            b"secret"
        );
        // Inside: the real file is what changes, and the link stays a link.
        let inner = dir.path().join("in.txt");
        std::os::windows::fs::symlink_file(dir.path().join("real.txt"), &inner).unwrap();
        let known = version_of_disk(dir.path(), "in.txt");
        write(dir.path(), "in.txt", "new", Some(&known)).unwrap();
        assert_eq!(std::fs::read(dir.path().join("real.txt")).unwrap(), b"new");
        assert!(
            std::fs::symlink_metadata(&inner)
                .unwrap()
                .file_type()
                .is_symlink()
        );
    }

    #[test]
    fn reads_a_text_file_with_its_version() {
        let dir = project(&[("src/a.ts", "é\n".as_bytes())]);
        let opened = read(dir.path(), "src/a.ts").unwrap();
        assert_eq!(opened.text, "é\n");
        assert_eq!(opened.version, version_of_disk(dir.path(), "src/a.ts"));
        assert!(opened.version.starts_with("3-"));
    }

    #[test]
    fn a_folder_and_a_missing_file_are_not_read() {
        let dir = project(&[("sub/a.txt", b"x")]);
        assert!(read(dir.path(), "sub").is_err());
        assert!(version(dir.path(), "sub").is_err());
        assert_eq!(
            read(dir.path(), "no.txt").unwrap_err(),
            "fichier introuvable : no.txt"
        );
    }

    #[test]
    fn refuses_to_read_a_file_over_the_limit_but_accepts_one_at_it() {
        let at = vec![b'x'; MAX_BYTES as usize];
        let over = vec![b'x'; MAX_BYTES as usize + 1];
        let dir = project(&[("at.txt", &at), ("over.txt", &over)]);
        assert_eq!(read(dir.path(), "at.txt").unwrap().text.len(), at.len());
        assert!(
            read(dir.path(), "over.txt")
                .unwrap_err()
                .contains("over.txt")
        );
        assert_eq!(
            version(dir.path(), "over.txt").unwrap().unwrap(),
            format!("over-{}", over.len())
        );
    }

    #[test]
    fn refuses_binary_and_non_utf8_files() {
        let dir = project(&[
            ("nul.bin", b"ab\0cd"),
            ("latin.txt", b"caf\xe9\n"),
            ("late.bin", &[vec![b'x'; 20_000], vec![0]].concat()),
        ]);
        assert!(read(dir.path(), "nul.bin").unwrap_err().contains("nul.bin"));
        assert!(read(dir.path(), "late.bin").is_err());
        let latin = read(dir.path(), "latin.txt").unwrap_err();
        assert!(latin.contains("latin.txt") && latin.contains("UTF-8"));
    }

    #[test]
    fn keeps_a_bom_and_crlf_byte_for_byte() {
        let bytes = b"\xef\xbb\xbfa\r\nb\nc\r\n";
        let dir = project(&[("a.txt", bytes)]);
        let opened = read(dir.path(), "a.txt").unwrap();
        write(dir.path(), "a.txt", &opened.text, Some(&opened.version)).unwrap();
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), bytes);
    }

    #[test]
    fn saves_against_the_expected_version_and_gives_the_new_one() {
        let dir = project(&[("a.txt", b"old")]);
        let opened = read(dir.path(), "a.txt").unwrap();
        let outcome = write(dir.path(), "a.txt", "new", Some(&opened.version)).unwrap();
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"new");
        assert_eq!(
            outcome,
            WriteOutcome::Saved {
                version: version_of_disk(dir.path(), "a.txt")
            }
        );
        assert_eq!(
            std::fs::read_dir(dir.path()).unwrap().count(),
            1,
            "no temporary file left"
        );
    }

    #[test]
    fn never_overwrites_what_changed_on_the_disk() {
        let dir = project(&[("a.txt", b"mine")]);
        let opened = read(dir.path(), "a.txt").unwrap();
        std::fs::write(dir.path().join("a.txt"), b"agent").unwrap();
        let disk = version_of_disk(dir.path(), "a.txt");
        assert_eq!(
            write(dir.path(), "a.txt", "mine!", Some(&opened.version)).unwrap(),
            WriteOutcome::Conflict {
                disk: Some(disk.clone())
            }
        );
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"agent");
        // Overwriting is writing against the version seen.
        let saved = write(dir.path(), "a.txt", "mine!", Some(&disk)).unwrap();
        assert!(matches!(saved, WriteOutcome::Saved { .. }));
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"mine!");
    }

    #[test]
    fn rewriting_the_same_content_is_no_conflict() {
        let dir = project(&[("a.txt", b"same")]);
        let opened = read(dir.path(), "a.txt").unwrap();
        std::fs::write(dir.path().join("a.txt"), b"same").unwrap();
        assert_eq!(
            version(dir.path(), "a.txt").unwrap(),
            Some(opened.version.clone())
        );
        assert!(matches!(
            write(dir.path(), "a.txt", "next", Some(&opened.version)).unwrap(),
            WriteOutcome::Saved { .. }
        ));
    }

    #[test]
    fn a_deleted_file_is_a_conflict_then_can_be_recreated() {
        let dir = project(&[("sub/a.txt", b"x")]);
        let opened = read(dir.path(), "sub/a.txt").unwrap();
        std::fs::remove_file(dir.path().join("sub/a.txt")).unwrap();
        assert_eq!(version(dir.path(), "sub/a.txt").unwrap(), None);
        assert_eq!(
            write(dir.path(), "sub/a.txt", "y", Some(&opened.version)).unwrap(),
            WriteOutcome::Conflict { disk: None }
        );
        assert!(!dir.path().join("sub/a.txt").exists());
        assert!(matches!(
            write(dir.path(), "sub/a.txt", "y", None).unwrap(),
            WriteOutcome::Saved { .. }
        ));
        assert_eq!(std::fs::read(dir.path().join("sub/a.txt")).unwrap(), b"y");
    }

    #[test]
    fn writing_a_file_expected_absent_is_a_conflict_when_it_exists() {
        let dir = project(&[("a.txt", b"x")]);
        let disk = version_of_disk(dir.path(), "a.txt");
        assert_eq!(
            write(dir.path(), "a.txt", "y", None).unwrap(),
            WriteOutcome::Conflict { disk: Some(disk) }
        );
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"x");
    }

    #[test]
    fn a_file_gone_with_its_folder_has_no_version_and_cannot_be_recreated() {
        let dir = project(&[("sub/deep/a.txt", b"x")]);
        std::fs::remove_dir_all(dir.path().join("sub")).unwrap();
        assert_eq!(version(dir.path(), "sub/deep/a.txt").unwrap(), None);
        assert!(write(dir.path(), "sub/deep/a.txt", "y", None).is_err());
    }

    #[test]
    fn refuses_to_write_over_the_limit_or_a_nul_byte() {
        let dir = project(&[("a.txt", b"x")]);
        let known = version_of_disk(dir.path(), "a.txt");
        let big = "x".repeat(MAX_BYTES as usize + 1);
        assert!(write(dir.path(), "a.txt", &big, Some(&known)).is_err());
        assert!(write(dir.path(), "a.txt", "a\0b", Some(&known)).is_err());
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"x");
    }

    #[test]
    fn a_file_grown_over_the_limit_still_goes_through_compare_then_write() {
        let dir = project(&[("a.txt", b"x")]);
        let opened = read(dir.path(), "a.txt").unwrap();
        let grown = vec![b'y'; MAX_BYTES as usize + 1];
        std::fs::write(dir.path().join("a.txt"), &grown).unwrap();
        let disk = format!("over-{}", grown.len());
        assert_eq!(
            write(dir.path(), "a.txt", "mine", Some(&opened.version)).unwrap(),
            WriteOutcome::Conflict {
                disk: Some(disk.clone())
            }
        );
        assert!(matches!(
            write(dir.path(), "a.txt", "mine", Some(&disk)).unwrap(),
            WriteOutcome::Saved { .. }
        ));
    }

    #[test]
    fn refuses_a_read_only_file_and_leaves_no_temporary_file() {
        let dir = project(&[("a.txt", b"x")]);
        let path = dir.path().join("a.txt");
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&path, permissions.clone()).unwrap();
        let known = version_of_disk(dir.path(), "a.txt");
        assert!(write(dir.path(), "a.txt", "y", Some(&known)).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"x");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        std::fs::set_permissions(&path, permissions).unwrap();
    }

    #[test]
    fn an_outcome_reads_as_the_frontend_expects() {
        assert_eq!(
            serde_json::to_value(WriteOutcome::Saved {
                version: "1-a".into()
            })
            .unwrap(),
            serde_json::json!({ "status": "saved", "version": "1-a" })
        );
        assert_eq!(
            serde_json::to_value(WriteOutcome::Conflict {
                disk: Some("1-b".into())
            })
            .unwrap(),
            serde_json::json!({ "status": "conflict", "disk": "1-b" })
        );
        assert_eq!(
            serde_json::to_value(WriteOutcome::Conflict { disk: None }).unwrap(),
            serde_json::json!({ "status": "conflict", "disk": null })
        );
        assert_eq!(
            serde_json::to_value(OpenedFile {
                text: "x".into(),
                version: "1-a".into()
            })
            .unwrap(),
            serde_json::json!({ "text": "x", "version": "1-a" })
        );
    }

    #[test]
    fn lists_tracked_and_untracked_files_without_ignored_or_deleted_ones() {
        let dir = project(&[
            (".gitignore", b"ignored.txt\nbuild/\n"),
            ("tracked.txt", b"x"),
            ("gone.txt", b"x"),
            ("src/é.ts", b"x"),
            ("untracked.txt", b"x"),
            ("ignored.txt", b"x"),
            ("build/out.js", b"x"),
        ]);
        if !git(dir.path(), &["init"]) {
            return; // git is not installed on this machine
        }
        assert!(git(
            dir.path(),
            &["add", ".gitignore", "tracked.txt", "gone.txt"]
        ));
        assert!(git(dir.path(), &["add", "src"]));
        assert!(git(dir.path(), &["commit", "-q", "-m", "init"]));
        std::fs::remove_file(dir.path().join("gone.txt")).unwrap();
        assert_eq!(
            files(dir.path()).unwrap(),
            [".gitignore", "src/é.ts", "tracked.txt", "untracked.txt"]
        );
    }

    #[test]
    fn lists_only_the_project_folder_of_a_larger_repository() {
        let dir = project(&[("other/a.txt", b"x"), ("app/src/b.txt", b"x")]);
        if !git(dir.path(), &["init"]) {
            return; // git is not installed on this machine
        }
        assert_eq!(files(&dir.path().join("app")).unwrap(), ["src/b.txt"]);
    }

    #[test]
    fn walks_a_folder_outside_a_repository() {
        let dir = project(&[
            ("a.txt", b"x"),
            ("sub/b.txt", b"x"),
            ("node_modules/dep/index.js", b"x"),
            ("target/debug/app.exe", b"x"),
            (".git/config", b"x"),
        ]);
        assert_eq!(files(dir.path()).unwrap(), ["a.txt", "sub/b.txt"]);
    }

    #[cfg(windows)]
    #[test]
    fn the_walk_keeps_secrets_out_of_the_list() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for name in [
            ".env",
            ".env.local",
            ".ENV.production",
            ".envrc",
            "server.pem",
            "SERVER.KEY",
            "cert.p12",
            "store.pfx",
            "app.keystore",
            "release.jks",
            "putty.ppk",
            "id_rsa",
            "id_ed25519",
            ".netrc",
            ".npmrc",
            ".pypirc",
            ".git-credentials",
            "credentials.json",
        ] {
            std::fs::write(root.join(name), "secret").unwrap();
        }
        std::fs::create_dir_all(root.join("deep").join(".ssh")).unwrap();
        std::fs::write(root.join("deep").join(".ssh").join("config"), "x").unwrap();
        std::fs::create_dir(root.join(".aws")).unwrap();
        std::fs::write(root.join(".aws").join("config"), "x").unwrap();
        std::fs::write(root.join("deep").join(".env"), "secret").unwrap();
        for name in ["main.rs", "environment.md", "id_rsa.pub", "keys.md"] {
            std::fs::write(root.join(name), "x").unwrap();
        }
        assert_eq!(
            files(root).unwrap(),
            ["environment.md", "id_rsa.pub", "keys.md", "main.rs"]
        );
    }

    #[test]
    fn the_walk_does_not_follow_a_junction() {
        let outside = project(&[("secret.txt", b"x")]);
        let dir = project(&[("a.txt", b"x")]);
        junction(&dir.path().join("link"), outside.path());
        assert_eq!(files(dir.path()).unwrap(), ["a.txt"]);
    }

    #[test]
    fn a_missing_project_folder_is_an_error() {
        let dir = project(&[]);
        let gone: PathBuf = dir.path().join("gone");
        assert!(read(&gone, "a.txt").is_err());
        assert!(version(&gone, "a.txt").is_err());
        assert!(write(&gone, "a.txt", "x", None).is_err());
    }
}
