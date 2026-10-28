//! Windows' PATH, re-read from the registry: an agent installed while OpenVibe
//! runs is on the PATH of new terminals, not of this process.

use std::ffi::OsString;
use std::sync::RwLock;

static REFRESHED: RwLock<Option<OsString>> = RwLock::new(None);

/// Expands `%NAME%` references like a `REG_EXPAND_SZ` value; an unknown
/// variable, or a lone `%`, stays as written.
pub fn expand(raw: &str, var: impl Fn(&str) -> Option<String>) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) if end > 0 => match var(&after[..end]) {
                Some(value) => {
                    out.push_str(&value);
                    rest = &after[end + 1..];
                }
                None => {
                    out.push('%');
                    rest = after;
                }
            },
            _ => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// A variable for `expand`: the process's, else the registry's, where an
/// installer may just have created it (its own `%…%` expanded from the
/// process's). Names compare case-insensitively, as Windows does.
pub fn lookup(
    name: &str,
    process: impl Fn(&str) -> Option<String>,
    registry: &[(String, String)],
) -> Option<String> {
    process(name).or_else(|| {
        registry
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| expand(value, &process))
    })
}

fn same_folder(entry: &str) -> String {
    entry.trim_end_matches(['\\', '/']).to_lowercase()
}

/// A quoted entry (`"C:\Program Files\x"`) names the same folder as its
/// unquoted form; the quotes must go, or the folder is not found.
fn unquote(entry: &str) -> &str {
    entry
        .strip_prefix('"')
        .and_then(|entry| entry.strip_suffix('"'))
        .unwrap_or(entry)
}

/// This process's PATH in its order, then the registry's entries it lacks,
/// machine then user (as Windows orders them): a new install is found and
/// what OpenVibe was started with still comes first (final review R5d).
pub fn merge(machine: &str, user: &str, process: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut entries: Vec<&str> = Vec::new();
    for entry in [process, machine, user]
        .into_iter()
        .flat_map(|list| list.split(';'))
    {
        let entry = unquote(entry.trim());
        if !entry.is_empty() && seen.insert(same_folder(entry)) {
            entries.push(entry);
        }
    }
    entries.join(";")
}

#[cfg(windows)]
const MACHINE_ENVIRONMENT: &str = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment";

/// The variables of a registry `Environment` key, `Path` included.
#[cfg(windows)]
fn registry_variables(root: winreg::HKEY, key: &str) -> Vec<(String, String)> {
    let Ok(key) = winreg::RegKey::predef(root).open_subkey(key) else {
        return Vec::new();
    };
    key.enum_values()
        .flatten()
        .filter_map(|(name, _)| {
            key.get_value::<String, _>(&name)
                .ok()
                .map(|value| (name, value))
        })
        .collect()
}

#[cfg(windows)]
fn path_of(variables: &[(String, String)]) -> &str {
    variables
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("Path"))
        .map_or("", |(_, value)| value.as_str())
}

/// Re-reads the PATH from the registry (no-op off Windows).
pub fn refresh() {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        let user_vars = registry_variables(HKEY_CURRENT_USER, "Environment");
        let machine_vars = registry_variables(HKEY_LOCAL_MACHINE, MACHINE_ENVIRONMENT);
        // A user variable overrides a machine one of the same name, as in Windows.
        let registry: Vec<(String, String)> =
            user_vars.iter().chain(&machine_vars).cloned().collect();
        let env = |name: &str| lookup(name, |n| std::env::var(n).ok(), &registry);
        let user = expand(path_of(&user_vars), env);
        let machine = expand(path_of(&machine_vars), env);
        let process = std::env::var("PATH").unwrap_or_default();
        let merged = merge(&machine, &user, &process);
        *REFRESHED.write().unwrap_or_else(|e| e.into_inner()) = Some(merged.into());
    }
}

/// The refreshed PATH; `None` until the first refresh.
pub fn current() -> Option<OsString> {
    REFRESHED.read().unwrap_or_else(|e| e.into_inner()).clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(name: &str) -> Option<String> {
        match name {
            "USERPROFILE" => Some(r"C:\Users\Me".into()),
            "LOCALAPPDATA" => Some(r"C:\Users\Me\AppData\Local".into()),
            _ => None,
        }
    }

    #[test]
    fn expands_known_variables() {
        assert_eq!(
            expand(r"%USERPROFILE%\bin;;C:\x", vars),
            r"C:\Users\Me\bin;;C:\x"
        );
        assert_eq!(
            expand(r"%LOCALAPPDATA%\Programs\a", vars),
            r"C:\Users\Me\AppData\Local\Programs\a"
        );
    }

    #[test]
    fn reads_a_variable_an_installer_just_created_from_the_registry() {
        // pnpm's setup adds PNPM_HOME and %PNPM_HOME% to the PATH: this
        // process never had the variable (final review R5d).
        let registry = vec![
            ("PNPM_HOME".to_string(), r"%LOCALAPPDATA%\pnpm".to_string()),
            ("USERPROFILE".to_string(), r"C:\Elsewhere".to_string()),
        ];
        let var = |name: &str| lookup(name, vars, &registry);
        assert_eq!(
            expand(r"%PNPM_HOME%;%pnpm_home%\bin;C:\x", var),
            r"C:\Users\Me\AppData\Local\pnpm;C:\Users\Me\AppData\Local\pnpm\bin;C:\x"
        );
        // The process's own value comes first.
        assert_eq!(expand(r"%USERPROFILE%", var), r"C:\Users\Me");
        assert_eq!(expand(r"%NOPE%", var), r"%NOPE%");
    }

    #[test]
    fn keeps_unknown_variables_and_lone_percents() {
        assert_eq!(expand(r"%NOPE%\bin", vars), r"%NOPE%\bin");
        assert_eq!(expand(r"C:\100%\x", vars), r"C:\100%\x");
        assert_eq!(expand("%%", vars), "%%");
    }

    #[test]
    fn keeps_the_process_path_in_its_order_then_adds_the_registry_s_new_entries() {
        // Launched from a shell with its own prepends (nvm, venv), a terminal
        // still finds the same tools first (final review R5d).
        assert_eq!(
            merge(r"C:\m1;C:\m2", r"C:\u1;C:\u2", r"C:\p0;C:\m2;C:\u1"),
            r"C:\p0;C:\m2;C:\u1;C:\m1;C:\u2"
        );
    }

    #[test]
    fn merge_drops_the_quotes_of_a_quoted_entry() {
        assert_eq!(
            merge(r#""C:\Program Files\x""#, "", r""),
            r"C:\Program Files\x"
        );
        assert_eq!(merge(r#""C:\Bin""#, "", r"C:\Bin"), r"C:\Bin");
    }

    #[test]
    fn merge_drops_empty_entries_and_duplicates() {
        assert_eq!(
            merge(r"C:\Bin;;C:\bin\;c:\BIN/", "", r"C:\other\"),
            r"C:\other\;C:\Bin"
        );
        assert_eq!(merge("", "", ""), "");
    }
}
