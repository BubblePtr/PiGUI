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

const MAX_TEXT_TITLE_CHARS: usize = 96;
const SENTENCE_TERMINATORS: [char; 6] = ['.', '!', '?', '。', '！', '？'];

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
    pub title: Title,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Title {
    Command { name: String, args: String },
    Skill { name: String },
    Text { sentence: String },
    Raw { text: String },
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
    let mut session_record = None;
    let mut first_user_message = None;

    for line in reader.lines() {
        let line = line.map_err(|source| SessionIndexError::ReadSession {
            path: path.to_path_buf(),
            source,
        })?;

        let Ok(record) = serde_json::from_str::<EventRecord>(&line) else {
            continue;
        };

        match record.event_type.as_str() {
            "session" => {
                if let (Some(id), Some(timestamp), Some(cwd)) =
                    (record.id, record.timestamp, record.cwd)
                {
                    session_record = Some((id, timestamp, cwd));
                }
            }
            "message"
                if record.role.as_ref() == Some(&MessageRole::User)
                    && first_user_message.is_none() =>
            {
                first_user_message = first_text_from_content(record.content);
            }
            _ => {}
        }

        if session_record.is_some() && first_user_message.is_some() {
            break;
        }
    }

    let Some((id, sort_timestamp, cwd)) = session_record else {
        return Ok(None);
    };

    let timestamp = sort_timestamp.to_rfc3339();
    Ok(Some(IndexedSession {
        summary: SessionSummary {
            id,
            timestamp,
            project: derive_project_name(&cwd),
            title: classify_title(first_user_message.as_deref().unwrap_or_default()),
        },
        sort_timestamp,
    }))
}

pub fn classify_title(first_user_message: &str) -> Title {
    let text = compact_whitespace(first_user_message);
    if is_trivial_title(&text) {
        return Title::Raw { text };
    }

    if let Some(name) = parse_skill_name(&text) {
        return Title::Skill { name };
    }

    if let Some((name, args)) = parse_command(&text) {
        return Title::Command { name, args };
    }

    if text.is_empty() {
        return Title::Raw { text };
    }

    Title::Text {
        sentence: first_sentence_title(&text),
    }
}

fn derive_project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| cwd.to_owned())
}

fn first_text_from_content(content: Option<Value>) -> Option<String> {
    match content? {
        Value::Array(parts) => parts
            .into_iter()
            .find_map(|part| text_value(&part).map(ToOwned::to_owned)),
        Value::String(text) => Some(text),
        value => text_value(&value).map(ToOwned::to_owned),
    }
}

fn text_value(value: &Value) -> Option<&str> {
    value
        .get("text")
        .or_else(|| value.get("content"))
        .and_then(Value::as_str)
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

fn compact_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_trivial_title(text: &str) -> bool {
    matches!(
        text.to_ascii_lowercase().as_str(),
        "" | "hi" | "hello" | "hey" | "echo test" | "/exit"
    )
}

fn parse_command(text: &str) -> Option<(String, String)> {
    let command = text.strip_prefix('/')?;
    let (name, args) = command
        .split_once(char::is_whitespace)
        .map_or((command, ""), |(name, args)| (name, args.trim()));

    if name.is_empty() {
        return None;
    }

    Some((name.to_owned(), args.to_owned()))
}

fn parse_skill_name(text: &str) -> Option<String> {
    if !text.starts_with("<skill") {
        return None;
    }

    let name_attr = text.find("name=")?;
    let name_start = name_attr + "name=".len();
    let quote = text[name_start..].chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }

    let value_start = name_start + quote.len_utf8();
    let value_end = text[value_start..].find(quote)? + value_start;
    let name = text[value_start..value_end].trim();

    if name.is_empty() {
        return None;
    }

    Some(name.to_owned())
}

fn first_sentence_title(text: &str) -> String {
    let first_sentence = text
        .char_indices()
        .find(|(_, character)| SENTENCE_TERMINATORS.contains(character))
        .map(|(index, character)| {
            let end = index + character.len_utf8();
            text[..end].trim()
        })
        .unwrap_or(text);

    truncate_at_word_boundary(first_sentence, MAX_TEXT_TITLE_CHARS)
}

fn truncate_at_word_boundary(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_owned();
    }

    let mut char_indices = text.char_indices();
    let cutoff = char_indices
        .nth(max_chars)
        .map(|(index, _)| index)
        .unwrap_or(text.len());
    let candidate = &text[..cutoff];
    let boundary = candidate
        .char_indices()
        .rev()
        .find(|(_, character)| character.is_whitespace())
        .map(|(index, _)| index);

    let truncated = boundary
        .filter(|index| *index > 0)
        .map_or(candidate, |index| &candidate[..index])
        .trim_end_matches(SENTENCE_TERMINATORS);

    format!("{}...", truncated.trim_end())
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
        assert_eq!(
            sessions
                .iter()
                .map(|session| &session.title)
                .collect::<Vec<_>>(),
            vec![
                &Title::Command {
                    name: "review".to_owned(),
                    args: String::new(),
                },
                &Title::Text {
                    sentence: "Show project status.".to_owned(),
                },
                &Title::Text {
                    sentence: "Show project status.".to_owned(),
                },
            ]
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

    #[test]
    fn classify_title_returns_command_for_slash_command_with_arguments() {
        assert_eq!(
            classify_title("/grilling sharpen this plan"),
            Title::Command {
                name: "grilling".to_owned(),
                args: "sharpen this plan".to_owned(),
            }
        );
    }

    #[test]
    fn classify_title_returns_skill_for_skill_invocation() {
        assert_eq!(
            classify_title("<skill name=\"kami\">make this one-pager</skill>"),
            Title::Skill {
                name: "kami".to_owned(),
            }
        );
    }

    #[test]
    fn classify_title_returns_first_complete_sentence_for_natural_language() {
        assert_eq!(
            classify_title("Show me the latest task status. Then explain blockers."),
            Title::Text {
                sentence: "Show me the latest task status.".to_owned(),
            }
        );
    }

    #[test]
    fn classify_title_returns_raw_for_trivial_messages() {
        assert_eq!(
            classify_title("hi"),
            Title::Raw {
                text: "hi".to_owned(),
            }
        );
        assert_eq!(
            classify_title("echo test"),
            Title::Raw {
                text: "echo test".to_owned(),
            }
        );
        assert_eq!(
            classify_title("/exit"),
            Title::Raw {
                text: "/exit".to_owned(),
            }
        );
    }

    #[test]
    fn classify_title_truncates_without_cutting_mid_word() {
        assert_eq!(
            classify_title(
                "Summarize the extraordinarily complicated migration plan for everyone before tomorrow morning because the review is blocked."
            ),
            Title::Text {
                sentence:
                    "Summarize the extraordinarily complicated migration plan for everyone before tomorrow morning..."
                        .to_owned(),
            }
        );
    }

    #[test]
    fn classify_title_compacts_multiline_whitespace() {
        assert_eq!(
            classify_title("Explain\n\nthis\tchange please."),
            Title::Text {
                sentence: "Explain this change please.".to_owned(),
            }
        );
    }
}
