use std::{
    collections::BTreeMap,
    env,
    ffi::OsStr,
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use walkdir::WalkDir;

#[derive(Debug, Error)]
pub enum SessionIndexError {
    #[error("HOME is not set and PI_CODING_AGENT_DIR was not provided")]
    MissingHome,
    #[error("failed to read session file {path}: {source}")]
    ReadSession {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to walk sessions directory {path}: {source}")]
    WalkSessions {
        path: PathBuf,
        #[source]
        source: walkdir::Error,
    },
}

#[derive(Debug, Error)]
pub enum SessionDetailError {
    #[error(transparent)]
    Index(#[from] SessionIndexError),
    #[error("session {id} was not found")]
    NotFound { id: String },
    #[error("failed to read session file {path}: {source}")]
    ReadSession {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to parse JSONL at line {line_number}: {source}")]
    ParseLine {
        line_number: usize,
        #[source]
        source: serde_json::Error,
    },
    #[error("session JSONL did not contain a session record")]
    MissingSessionRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub timestamp: String,
    pub project: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub id: String,
    pub timestamp: String,
    pub project: String,
    pub turns: Vec<SessionTurn>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTurn {
    pub kind: SessionTurnKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<MessageRole>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub parts: Vec<SessionContentPart>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionTurnKind {
    Message,
    Annotation,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MessageRole {
    User,
    Assistant,
    ToolResult,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContentPart {
    pub part_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub payload: Value,
}

#[derive(Debug)]
struct IndexedSession {
    summary: SessionSummary,
    sort_timestamp: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct SessionRecord {
    #[serde(rename = "type")]
    record_type: String,
    id: String,
    timestamp: DateTime<Utc>,
    cwd: String,
}

#[derive(Debug, Deserialize)]
struct EventRecord {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    timestamp: Option<DateTime<Utc>>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    role: Option<MessageRole>,
    #[serde(default)]
    content: Option<Value>,
    #[serde(flatten)]
    fields: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SessionStateUpdate {
    Ignored,
    SessionStarted(SessionDetail),
    TurnAppended(SessionTurn),
}

#[derive(Debug, Default)]
pub struct SessionParser {
    detail: Option<SessionDetail>,
}

impl SessionParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed_line(&mut self, line: &str) -> Result<SessionStateUpdate, serde_json::Error> {
        if line.trim().is_empty() {
            return Ok(SessionStateUpdate::Ignored);
        }

        let record = serde_json::from_str::<EventRecord>(line)?;
        match record.event_type.as_str() {
            "session" => {
                let detail = SessionDetail {
                    id: record.id.unwrap_or_default(),
                    timestamp: record
                        .timestamp
                        .map(|timestamp| timestamp.to_rfc3339())
                        .unwrap_or_default(),
                    project: record
                        .cwd
                        .as_deref()
                        .map(derive_project_name)
                        .unwrap_or_default(),
                    turns: Vec::new(),
                };
                self.detail = Some(detail.clone());
                Ok(SessionStateUpdate::SessionStarted(detail))
            }
            "message" => {
                let turn = SessionTurn {
                    kind: SessionTurnKind::Message,
                    role: record.role,
                    timestamp: record.timestamp.map(|timestamp| timestamp.to_rfc3339()),
                    title: None,
                    parts: content_parts(record.content),
                };
                self.append_turn(turn)
            }
            "model_change" | "thinking_level_change" => {
                let turn = SessionTurn {
                    kind: SessionTurnKind::Annotation,
                    role: None,
                    timestamp: record.timestamp.map(|timestamp| timestamp.to_rfc3339()),
                    title: Some(annotation_title(&record.event_type).to_owned()),
                    parts: vec![SessionContentPart {
                        part_type: record.event_type,
                        text: None,
                        name: None,
                        payload: Value::Object(
                            record.fields.into_iter().collect::<serde_json::Map<_, _>>(),
                        ),
                    }],
                };
                self.append_turn(turn)
            }
            _ => Ok(SessionStateUpdate::Ignored),
        }
    }

    pub fn finish(self) -> Option<SessionDetail> {
        self.detail
    }

    fn append_turn(&mut self, turn: SessionTurn) -> Result<SessionStateUpdate, serde_json::Error> {
        let Some(detail) = self.detail.as_mut() else {
            return Ok(SessionStateUpdate::Ignored);
        };

        detail.turns.push(turn.clone());
        Ok(SessionStateUpdate::TurnAppended(turn))
    }
}

pub fn resolve_agent_dir() -> Result<PathBuf, SessionIndexError> {
    if let Some(agent_dir) = env::var_os("PI_CODING_AGENT_DIR") {
        return Ok(PathBuf::from(agent_dir));
    }

    let home = env::var_os("HOME").ok_or(SessionIndexError::MissingHome)?;
    Ok(PathBuf::from(home).join(".pi").join("agent"))
}

pub fn build_index(dir: impl AsRef<Path>) -> Result<Vec<SessionSummary>, SessionIndexError> {
    let sessions_dir = dir.as_ref().join("sessions");
    if !sessions_dir.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();

    for entry in WalkDir::new(&sessions_dir).follow_links(false) {
        let entry = entry.map_err(|source| SessionIndexError::WalkSessions {
            path: sessions_dir.clone(),
            source,
        })?;
        let path = entry.path();

        if !entry.file_type().is_file() || path.extension() != Some(OsStr::new("jsonl")) {
            continue;
        }

        if let Some(session) = read_session_summary(path)? {
            sessions.push(session);
        }
    }

    sessions.sort_by(|left, right| right.sort_timestamp.cmp(&left.sort_timestamp));

    Ok(sessions
        .into_iter()
        .map(|session| session.summary)
        .collect())
}

pub fn load_session_detail(
    dir: impl AsRef<Path>,
    id: &str,
) -> Result<SessionDetail, SessionDetailError> {
    let path = find_session_file(dir, id)?
        .ok_or_else(|| SessionDetailError::NotFound { id: id.to_owned() })?;
    let jsonl = fs::read_to_string(&path)
        .map_err(|source| SessionDetailError::ReadSession { path, source })?;

    parse_session(&jsonl)
}

pub fn parse_session(jsonl: &str) -> Result<SessionDetail, SessionDetailError> {
    let mut parser = SessionParser::new();

    for (index, line) in jsonl.lines().enumerate() {
        parser
            .feed_line(line)
            .map_err(|source| SessionDetailError::ParseLine {
                line_number: index + 1,
                source,
            })?;
    }

    parser
        .finish()
        .ok_or(SessionDetailError::MissingSessionRecord)
}

fn find_session_file(
    dir: impl AsRef<Path>,
    id: &str,
) -> Result<Option<PathBuf>, SessionIndexError> {
    let sessions_dir = dir.as_ref().join("sessions");
    if !sessions_dir.exists() {
        return Ok(None);
    }

    for entry in WalkDir::new(&sessions_dir).follow_links(false) {
        let entry = entry.map_err(|source| SessionIndexError::WalkSessions {
            path: sessions_dir.clone(),
            source,
        })?;
        let path = entry.path();

        if !entry.file_type().is_file() || path.extension() != Some(OsStr::new("jsonl")) {
            continue;
        }

        if let Some(session) = read_session_summary(path)? {
            if session.summary.id == id {
                return Ok(Some(path.to_path_buf()));
            }
        }
    }

    Ok(None)
}

fn read_session_summary(path: &Path) -> Result<Option<IndexedSession>, SessionIndexError> {
    let file = File::open(path).map_err(|source| SessionIndexError::ReadSession {
        path: path.to_path_buf(),
        source,
    })?;
    let reader = BufReader::new(file);

    for line in reader.lines() {
        let line = line.map_err(|source| SessionIndexError::ReadSession {
            path: path.to_path_buf(),
            source,
        })?;

        let Ok(record) = serde_json::from_str::<SessionRecord>(&line) else {
            continue;
        };
        if record.record_type != "session" {
            continue;
        }

        let timestamp = record.timestamp.to_rfc3339();
        return Ok(Some(IndexedSession {
            summary: SessionSummary {
                id: record.id,
                timestamp,
                project: derive_project_name(&record.cwd),
            },
            sort_timestamp: record.timestamp,
        }));
    }

    Ok(None)
}

fn derive_project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| cwd.to_owned())
}

fn content_parts(content: Option<Value>) -> Vec<SessionContentPart> {
    match content {
        Some(Value::Array(parts)) => parts
            .into_iter()
            .map(SessionContentPart::from_value)
            .collect(),
        Some(Value::String(text)) => vec![SessionContentPart {
            part_type: "text".to_owned(),
            text: Some(text),
            name: None,
            payload: Value::Null,
        }],
        Some(value) => vec![SessionContentPart::from_value(value)],
        None => Vec::new(),
    }
}

impl SessionContentPart {
    fn from_value(value: Value) -> Self {
        let part_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        let text = value
            .get("text")
            .or_else(|| value.get("thinking"))
            .or_else(|| value.get("content"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let name = value
            .get("name")
            .or_else(|| value.get("toolName"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);

        Self {
            part_type,
            text,
            name,
            payload: value,
        }
    }
}

fn annotation_title(event_type: &str) -> &'static str {
    match event_type {
        "model_change" => "Model changed",
        "thinking_level_change" => "Thinking level changed",
        _ => "Session annotation",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/pi-agent")
    }

    fn read_fixture(project: &str, file: &str) -> String {
        fs::read_to_string(fixture_dir().join("sessions").join(project).join(file))
            .expect("fixture should read")
    }

    #[test]
    fn build_index_returns_flat_newest_first_sessions_with_projects() {
        let sessions = build_index(fixture_dir()).expect("fixture sessions should index");

        assert_eq!(sessions.len(), 3);
        assert_eq!(
            sessions
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            vec!["newest-session", "middle-session", "oldest-session"]
        );
        assert_eq!(
            sessions
                .iter()
                .map(|session| session.project.as_str())
                .collect::<Vec<_>>(),
            vec!["gamma", "beta", "alpha"]
        );
    }

    #[test]
    fn build_index_returns_empty_when_sessions_directory_is_missing() {
        let temp = tempfile::tempdir().expect("tempdir");

        let sessions = build_index(temp.path()).expect("missing sessions dir is valid");

        assert!(sessions.is_empty());
    }

    #[test]
    fn parse_session_reconstructs_turn_order_and_content_part_types() {
        let jsonl = read_fixture(
            "project-beta",
            "2026-01-03T12-00-00-000Z_middle-session.jsonl",
        );

        let detail = parse_session(&jsonl).expect("fixture session should parse");

        assert_eq!(detail.id, "middle-session");
        assert_eq!(detail.project, "beta");
        assert_eq!(
            detail
                .turns
                .iter()
                .map(|turn| (&turn.kind, turn.role.as_ref()))
                .collect::<Vec<_>>(),
            vec![
                (&SessionTurnKind::Annotation, None),
                (&SessionTurnKind::Annotation, None),
                (&SessionTurnKind::Message, Some(&MessageRole::User)),
                (&SessionTurnKind::Message, Some(&MessageRole::Assistant)),
                (&SessionTurnKind::Message, Some(&MessageRole::ToolResult)),
            ]
        );
        assert_eq!(
            detail.turns[3]
                .parts
                .iter()
                .map(|part| part.part_type.as_str())
                .collect::<Vec<_>>(),
            vec!["thinking", "text", "toolCall", "image"]
        );
        assert_eq!(
            detail.turns[3].parts[0].text.as_deref(),
            Some("Need to inspect the tree.")
        );
        assert_eq!(detail.turns[3].parts[2].name.as_deref(), Some("list_files"));
        assert_eq!(detail.turns[4].parts[0].part_type, "text");
    }

    #[test]
    fn session_parser_emits_incremental_updates() {
        let jsonl = read_fixture(
            "project-beta",
            "2026-01-03T12-00-00-000Z_middle-session.jsonl",
        );
        let mut parser = SessionParser::new();

        let updates = jsonl
            .lines()
            .map(|line| parser.feed_line(line).expect("line should parse"))
            .collect::<Vec<_>>();

        assert!(matches!(updates[0], SessionStateUpdate::SessionStarted(_)));
        assert!(matches!(updates[1], SessionStateUpdate::TurnAppended(_)));
        assert!(matches!(updates[3], SessionStateUpdate::TurnAppended(_)));
        assert_eq!(parser.finish().expect("session started").turns.len(), 5);
    }

    #[test]
    fn load_session_detail_finds_fixture_session_by_id() {
        let detail = load_session_detail(fixture_dir(), "middle-session")
            .expect("fixture detail should load");

        assert_eq!(detail.id, "middle-session");
        assert_eq!(detail.turns.len(), 5);
    }
}
