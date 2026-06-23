use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env,
    ffi::OsStr,
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    time::SystemTime,
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

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub timestamp: String,
    pub project: String,
    pub title: Title,
    pub total_cost_usd: f64,
    pub total_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_model: Option<String>,
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
    pub total_cost_usd: f64,
    pub total_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_model: Option<String>,
    pub turn_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<i64>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<CostBreakdown>,
    pub parts: Vec<SessionContentPart>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CostBreakdown {
    pub input_usd: f64,
    pub output_usd: f64,
    pub cache_read_usd: f64,
    pub cache_write_usd: f64,
    pub total_usd: f64,
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

#[derive(Debug, Clone)]
struct IndexedSession {
    summary: SessionSummary,
    sort_timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct CachedSession {
    modified_at: SystemTime,
    session: IndexedSession,
}

#[derive(Debug, Default)]
pub struct SessionIndexCache {
    entries: HashMap<PathBuf, CachedSession>,
    hits: usize,
    misses: usize,
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
    metrics: SessionMetrics,
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
                self.metrics = SessionMetrics::default();
                self.metrics.touch(record.timestamp);
                if let Some(model) = string_field(&record.fields, &["model", "currentModel"]) {
                    self.metrics.current_model = Some(model);
                }

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
                    total_cost_usd: 0.0,
                    total_tokens: 0,
                    primary_model: None,
                    turn_count: 0,
                    duration_seconds: Some(0),
                    turns: Vec::new(),
                };
                self.detail = Some(detail.clone());
                Ok(SessionStateUpdate::SessionStarted(detail))
            }
            "message" => {
                self.metrics.touch(record.timestamp);
                let model = self.metrics.message_model(&record);
                let usage = token_usage_from_record(&record);
                let cost = cost_breakdown_from_record(&record);

                if record.role.as_ref() == Some(&MessageRole::Assistant) {
                    self.metrics.aggregate_assistant_message(
                        model.as_deref(),
                        usage.as_ref(),
                        cost.as_ref(),
                    );
                }
                self.metrics.turn_count += 1;

                let turn = SessionTurn {
                    kind: SessionTurnKind::Message,
                    role: record.role,
                    timestamp: record.timestamp.map(|timestamp| timestamp.to_rfc3339()),
                    title: None,
                    model,
                    usage,
                    cost,
                    parts: content_parts(record.content),
                };
                self.append_turn(turn)
            }
            "model_change" | "thinking_level_change" => {
                self.metrics.touch(record.timestamp);
                if record.event_type == "model_change" {
                    self.metrics.current_model = string_field(&record.fields, &["to", "model"])
                        .or_else(|| self.metrics.current_model.clone());
                }

                let turn = SessionTurn {
                    kind: SessionTurnKind::Annotation,
                    role: None,
                    timestamp: record.timestamp.map(|timestamp| timestamp.to_rfc3339()),
                    title: Some(annotation_title(&record.event_type).to_owned()),
                    model: self.metrics.current_model.clone(),
                    usage: None,
                    cost: None,
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
        self.sync_detail_metrics();
        Ok(SessionStateUpdate::TurnAppended(turn))
    }

    fn sync_detail_metrics(&mut self) {
        let Some(detail) = self.detail.as_mut() else {
            return;
        };

        detail.total_cost_usd = self.metrics.total_cost_usd;
        detail.total_tokens = self.metrics.total_tokens;
        detail.primary_model = self.metrics.primary_model();
        detail.turn_count = self.metrics.turn_count;
        detail.duration_seconds = self.metrics.duration_seconds();
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
    let mut cache = SessionIndexCache::default();
    build_index_with_cache(dir, &mut cache)
}

pub fn build_index_with_cache(
    dir: impl AsRef<Path>,
    cache: &mut SessionIndexCache,
) -> Result<Vec<SessionSummary>, SessionIndexError> {
    let sessions_dir = dir.as_ref().join("sessions");
    if !sessions_dir.exists() {
        cache.entries.clear();
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    let mut seen_paths = HashSet::new();

    for entry in WalkDir::new(&sessions_dir).follow_links(false) {
        let entry = entry.map_err(|source| SessionIndexError::WalkSessions {
            path: sessions_dir.clone(),
            source,
        })?;
        let path = entry.path();

        if !entry.file_type().is_file() || path.extension() != Some(OsStr::new("jsonl")) {
            continue;
        }

        let path = path.to_path_buf();
        seen_paths.insert(path.clone());

        if let Some(session) = read_session_summary_cached(&path, cache)? {
            sessions.push(session);
        }
    }

    cache.entries.retain(|path, _| seen_paths.contains(path));
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
    let mut metrics = SessionMetrics::default();

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
                metrics.touch(record.timestamp);
                metrics.current_model = string_field(&record.fields, &["model", "currentModel"]);

                if let (Some(id), Some(timestamp), Some(cwd)) =
                    (record.id, record.timestamp, record.cwd)
                {
                    session_record = Some((id, timestamp, cwd));
                }
            }
            "model_change" => {
                metrics.touch(record.timestamp);
                metrics.current_model = string_field(&record.fields, &["to", "model"])
                    .or_else(|| metrics.current_model.clone());
            }
            "message"
                if record.role.as_ref() == Some(&MessageRole::User)
                    && first_user_message.is_none() =>
            {
                metrics.touch(record.timestamp);
                first_user_message = first_text_from_content(record.content);
            }
            "message" => {
                metrics.touch(record.timestamp);
                let model = metrics.message_model(&record);
                let usage = token_usage_from_record(&record);
                let cost = cost_breakdown_from_record(&record);

                if record.role.as_ref() == Some(&MessageRole::Assistant) {
                    metrics.aggregate_assistant_message(
                        model.as_deref(),
                        usage.as_ref(),
                        cost.as_ref(),
                    );
                }
            }
            _ => {}
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
            total_cost_usd: metrics.total_cost_usd,
            total_tokens: metrics.total_tokens,
            primary_model: metrics.primary_model(),
        },
        sort_timestamp,
    }))
}

fn read_session_summary_cached(
    path: &Path,
    cache: &mut SessionIndexCache,
) -> Result<Option<IndexedSession>, SessionIndexError> {
    let modified_at = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|source| SessionIndexError::ReadSession {
            path: path.to_path_buf(),
            source,
        })?;

    if let Some(cached) = cache.entries.get(path) {
        if cached.modified_at == modified_at {
            cache.hits += 1;
            return Ok(Some(cached.session.clone()));
        }
    }

    cache.misses += 1;
    let session = read_session_summary(path)?;
    if let Some(session) = session.clone() {
        cache.entries.insert(
            path.to_path_buf(),
            CachedSession {
                modified_at,
                session,
            },
        );
    } else {
        cache.entries.remove(path);
    }

    Ok(session)
}

#[derive(Debug, Clone, Default)]
struct SessionMetrics {
    total_cost_usd: f64,
    total_tokens: u64,
    current_model: Option<String>,
    turn_count: usize,
    first_timestamp: Option<DateTime<Utc>>,
    last_timestamp: Option<DateTime<Utc>>,
    model_totals: HashMap<String, ModelTotals>,
}

#[derive(Debug, Clone, Default)]
struct ModelTotals {
    total_cost_usd: f64,
    total_tokens: u64,
}

impl SessionMetrics {
    fn touch(&mut self, timestamp: Option<DateTime<Utc>>) {
        let Some(timestamp) = timestamp else {
            return;
        };

        self.first_timestamp = Some(
            self.first_timestamp
                .map_or(timestamp, |current| current.min(timestamp)),
        );
        self.last_timestamp = Some(
            self.last_timestamp
                .map_or(timestamp, |current| current.max(timestamp)),
        );
    }

    fn message_model(&mut self, record: &EventRecord) -> Option<String> {
        if let Some(model) = string_field(&record.fields, &["model", "currentModel"]) {
            self.current_model = Some(model.clone());
            return Some(model);
        }

        self.current_model.clone()
    }

    fn aggregate_assistant_message(
        &mut self,
        model: Option<&str>,
        usage: Option<&TokenUsage>,
        cost: Option<&CostBreakdown>,
    ) {
        let cost_usd = cost.map_or(0.0, |cost| cost.total_usd);
        let tokens = usage.map_or(0, |usage| usage.total_tokens);

        self.total_cost_usd += cost_usd;
        self.total_tokens += tokens;

        if cost.is_none() && usage.is_none() {
            return;
        }

        let model = model.unwrap_or("Unknown model").to_owned();
        let totals = self.model_totals.entry(model).or_default();
        totals.total_cost_usd += cost_usd;
        totals.total_tokens += tokens;
    }

    fn primary_model(&self) -> Option<String> {
        self.model_totals
            .iter()
            .max_by(|left, right| {
                left.1
                    .total_cost_usd
                    .partial_cmp(&right.1.total_cost_usd)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| left.1.total_tokens.cmp(&right.1.total_tokens))
                    .then_with(|| right.0.cmp(left.0))
            })
            .map(|(model, _)| model.clone())
            .or_else(|| self.current_model.clone())
    }

    fn duration_seconds(&self) -> Option<i64> {
        Some(
            (self.last_timestamp? - self.first_timestamp?)
                .num_seconds()
                .max(0),
        )
    }
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

fn token_usage_from_record(record: &EventRecord) -> Option<TokenUsage> {
    let usage = record.fields.get("usage")?;
    let usage_object = usage.as_object()?;

    let input_tokens = u64_field(
        usage_object,
        &[
            "inputTokens",
            "input_tokens",
            "promptTokens",
            "prompt_tokens",
        ],
    );
    let output_tokens = u64_field(
        usage_object,
        &[
            "outputTokens",
            "output_tokens",
            "completionTokens",
            "completion_tokens",
        ],
    );
    let cache_read_tokens = u64_field(
        usage_object,
        &[
            "cacheReadTokens",
            "cache_read_tokens",
            "cachedInputTokens",
            "cached_input_tokens",
            "cachedTokens",
            "cached_tokens",
        ],
    );
    let cache_write_tokens = u64_field(
        usage_object,
        &[
            "cacheWriteTokens",
            "cache_write_tokens",
            "cacheCreationInputTokens",
            "cache_creation_input_tokens",
        ],
    );
    let total_tokens = u64_field(usage_object, &["totalTokens", "total_tokens", "total"])
        .unwrap_or(input_tokens.unwrap_or(0) + output_tokens.unwrap_or(0));

    Some(TokenUsage {
        input_tokens: input_tokens.unwrap_or(0),
        output_tokens: output_tokens.unwrap_or(0),
        cache_read_tokens: cache_read_tokens.unwrap_or(0),
        cache_write_tokens: cache_write_tokens.unwrap_or(0),
        total_tokens,
    })
}

fn cost_breakdown_from_record(record: &EventRecord) -> Option<CostBreakdown> {
    record
        .fields
        .get("cost")
        .or_else(|| record.fields.get("usage")?.get("cost"))
        .and_then(cost_breakdown_from_value)
}

fn cost_breakdown_from_value(value: &Value) -> Option<CostBreakdown> {
    if let Some(total_usd) = value.as_f64() {
        return Some(CostBreakdown {
            total_usd,
            ..CostBreakdown::default()
        });
    }

    let object = value.as_object()?;
    let input_usd = f64_field(
        object,
        &["inputUsd", "input_usd", "inputCost", "input_cost", "input"],
    )
    .unwrap_or(0.0);
    let output_usd = f64_field(
        object,
        &[
            "outputUsd",
            "output_usd",
            "outputCost",
            "output_cost",
            "output",
        ],
    )
    .unwrap_or(0.0);
    let cache_read_usd = f64_field(
        object,
        &[
            "cacheReadUsd",
            "cache_read_usd",
            "cacheReadCost",
            "cache_read_cost",
            "cacheRead",
            "cache_read",
        ],
    )
    .unwrap_or(0.0);
    let cache_write_usd = f64_field(
        object,
        &[
            "cacheWriteUsd",
            "cache_write_usd",
            "cacheWriteCost",
            "cache_write_cost",
            "cacheWrite",
            "cache_write",
        ],
    )
    .unwrap_or(0.0);
    let total_usd = f64_field(
        object,
        &[
            "totalUsd",
            "total_usd",
            "totalCostUsd",
            "total_cost_usd",
            "totalCost",
            "total_cost",
            "total",
        ],
    )
    .unwrap_or(input_usd + output_usd + cache_read_usd + cache_write_usd);

    Some(CostBreakdown {
        input_usd,
        output_usd,
        cache_read_usd,
        cache_write_usd,
        total_usd,
    })
}

fn string_field(fields: &BTreeMap<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| fields.get(*key)?.as_str())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn u64_field(object: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let value = object.get(*key)?;
        value
            .as_u64()
            .or_else(|| value.as_f64().map(|number| number.max(0.0) as u64))
            .or_else(|| value.as_str()?.parse::<u64>().ok())
    })
}

fn f64_field(object: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| {
        let value = object.get(*key)?;
        value
            .as_f64()
            .or_else(|| value.as_str()?.parse::<f64>().ok())
    })
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

    fn copy_fixture_dir() -> tempfile::TempDir {
        let temp = tempfile::tempdir().expect("tempdir");
        let target_sessions = temp.path().join("sessions");
        fs::create_dir_all(&target_sessions).expect("sessions dir");

        for entry in WalkDir::new(fixture_dir().join("sessions")) {
            let entry = entry.expect("fixture walk");
            let path = entry.path();
            let relative_path = path
                .strip_prefix(fixture_dir().join("sessions"))
                .expect("relative fixture path");
            let target_path = target_sessions.join(relative_path);

            if entry.file_type().is_dir() {
                fs::create_dir_all(&target_path).expect("fixture dir copy");
            } else if entry.file_type().is_file() {
                fs::copy(path, target_path).expect("fixture file copy");
            }
        }

        temp
    }

    fn assert_cost_eq(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-12,
            "expected {expected}, got {actual}"
        );
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
    fn build_index_with_cache_hits_when_mtime_is_unchanged() {
        let mut cache = SessionIndexCache::default();

        let first = build_index_with_cache(fixture_dir(), &mut cache).expect("first scan");
        let second = build_index_with_cache(fixture_dir(), &mut cache).expect("second scan");

        assert_eq!(first, second);
        assert_eq!(cache.misses, 3);
        assert_eq!(cache.hits, 3);
    }

    #[test]
    fn build_index_with_cache_recomputes_only_files_with_changed_mtime() {
        let temp = copy_fixture_dir();
        let mut cache = SessionIndexCache::default();

        build_index_with_cache(temp.path(), &mut cache).expect("first scan");
        let updated_path = temp
            .path()
            .join("sessions/project-alpha/2026-01-01T09-00-00-000Z_oldest-session.jsonl");
        let mut jsonl = fs::read_to_string(&updated_path).expect("fixture copy should read");
        jsonl.push('\n');
        fs::write(&updated_path, jsonl).expect("fixture copy should update");

        build_index_with_cache(temp.path(), &mut cache).expect("second scan");

        assert_eq!(cache.misses, 4);
        assert_eq!(cache.hits, 2);
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
    fn parse_session_aggregates_cost_and_tokens_across_model_changes() {
        let jsonl = r#"{"type":"session","id":"multi-model-session","timestamp":"2026-01-07T10:00:00.000Z","cwd":"/Users/example/code/delta","model":"gpt-5-mini"}
{"type":"message","role":"user","timestamp":"2026-01-07T10:00:01.000Z","content":[{"type":"text","text":"Compare these files."}]}
{"type":"message","role":"assistant","timestamp":"2026-01-07T10:00:02.000Z","usage":{"inputTokens":100,"outputTokens":50,"cost":{"inputUsd":0.01,"outputUsd":0.02,"totalUsd":0.03}},"content":[{"type":"text","text":"I will inspect both files."}]}
{"type":"model_change","timestamp":"2026-01-07T10:00:03.000Z","from":"gpt-5-mini","to":"gpt-5-codex"}
{"type":"message","role":"assistant","timestamp":"2026-01-07T10:00:04.000Z","usage":{"input_tokens":150,"output_tokens":50,"cache_read_tokens":20,"total_tokens":220},"cost":{"input_usd":0.04,"output_usd":0.08,"cache_read_usd":0.01,"total_usd":0.13},"content":[{"type":"text","text":"The second file changed the API contract."}]}"#;

        let detail = parse_session(jsonl).expect("multi-model fixture should parse");

        assert_eq!(detail.total_tokens, 370);
        assert_cost_eq(detail.total_cost_usd, 0.16);
        assert_eq!(detail.primary_model.as_deref(), Some("gpt-5-codex"));
        assert_eq!(detail.turn_count, 3);
        assert_eq!(detail.duration_seconds, Some(4));

        let assistant_turns = detail
            .turns
            .iter()
            .filter(|turn| turn.role.as_ref() == Some(&MessageRole::Assistant))
            .collect::<Vec<_>>();

        assert_eq!(assistant_turns.len(), 2);
        assert_eq!(assistant_turns[0].model.as_deref(), Some("gpt-5-mini"));
        assert_eq!(assistant_turns[0].usage.as_ref().unwrap().total_tokens, 150);
        assert_cost_eq(assistant_turns[0].cost.as_ref().unwrap().total_usd, 0.03);
        assert_eq!(assistant_turns[1].model.as_deref(), Some("gpt-5-codex"));
        assert_eq!(assistant_turns[1].usage.as_ref().unwrap().total_tokens, 220);
        assert_cost_eq(assistant_turns[1].cost.as_ref().unwrap().total_usd, 0.13);
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
