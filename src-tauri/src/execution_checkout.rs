use std::{
    fs,
    path::Path,
    process::{Command, Output},
};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetachedWorktreeInput {
    pub repo_root: String,
    pub checkout_root: String,
    pub session_id: String,
}

fn command_error(action: &str, output: Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();

    if stderr.is_empty() {
        format!("{action} failed with status {}", output.status)
    } else {
        format!("{action} failed: {stderr}")
    }
}

#[tauri::command]
pub fn is_git_repository(repo_root: String) -> Result<bool, String> {
    let output = match Command::new("git")
        .args(["-C", &repo_root, "rev-parse", "--is-inside-work-tree"])
        .output()
    {
        Ok(output) => output,
        Err(error) => return Err(format!("failed to run git: {error}")),
    };

    if !output.status.success() {
        return Ok(false);
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim() == "true")
}

#[tauri::command]
pub fn add_detached_worktree(input: DetachedWorktreeInput) -> Result<(), String> {
    if input.session_id.trim().is_empty() {
        return Err("session id is required to create a worktree".to_owned());
    }

    if let Some(parent) = Path::new(&input.checkout_root).parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create worktree parent directory: {error}"))?;
    }

    let output = Command::new("git")
        .args([
            "-C",
            &input.repo_root,
            "worktree",
            "add",
            "--detach",
            &input.checkout_root,
            "HEAD",
        ])
        .output()
        .map_err(|error| format!("failed to run git worktree add: {error}"))?;

    if !output.status.success() {
        return Err(command_error("git worktree add", output));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, File},
        process::Command,
    };

    use tempfile::TempDir;

    use super::{add_detached_worktree, is_git_repository, DetachedWorktreeInput};

    fn git(cwd: &std::path::Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .status()
            .expect("git command should run");

        assert!(status.success(), "git command failed: {args:?}");
    }

    fn git_output(cwd: &std::path::Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .expect("git command should run");

        assert!(output.status.success(), "git command failed: {args:?}");

        String::from_utf8(output.stdout).expect("git output should be utf8")
    }

    fn create_repo() -> (TempDir, std::path::PathBuf) {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let repo_root = temp_dir.path().join("repo");

        fs::create_dir_all(&repo_root).expect("repo dir should be created");
        File::create(repo_root.join("README.md")).expect("fixture file should be created");
        git(temp_dir.path(), &["init", "--initial-branch=main", "repo"]);
        git(&repo_root, &["config", "user.name", "Pig Test"]);
        git(&repo_root, &["config", "user.email", "pig@example.com"]);
        git(&repo_root, &["add", "."]);
        git(&repo_root, &["commit", "-m", "init"]);

        (temp_dir, repo_root)
    }

    #[test]
    fn detects_git_repositories() {
        let (temp_dir, repo_root) = create_repo();

        assert_eq!(is_git_repository(repo_root.display().to_string()), Ok(true));
        assert_eq!(
            is_git_repository(temp_dir.path().join("not-a-repo").display().to_string()),
            Ok(false),
        );
    }

    #[test]
    fn creates_detached_worktree() {
        let (temp_dir, repo_root) = create_repo();
        let checkout_root = temp_dir.path().join("pig-worktrees").join("session-1");

        add_detached_worktree(DetachedWorktreeInput {
            repo_root: repo_root.display().to_string(),
            checkout_root: checkout_root.display().to_string(),
            session_id: "session-1".to_owned(),
        })
        .expect("worktree should be created");

        assert!(checkout_root.join("README.md").exists());
        assert!(git_output(&repo_root, &["worktree", "list", "--porcelain"])
            .contains(&checkout_root.display().to_string()));
        assert!(git_output(&checkout_root, &["status", "--short"]).is_empty());
    }
}
