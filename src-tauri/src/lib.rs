pub mod sessions;

use std::sync::Mutex;

use sessions::{
    build_index_with_cache, load_session_detail, resolve_agent_dir, SessionDetail,
    SessionIndexCache, SessionSummary,
};
use tauri::State;

#[derive(Default)]
struct SessionIndexState {
    cache: Mutex<SessionIndexCache>,
}

#[tauri::command]
fn list_sessions(state: State<'_, SessionIndexState>) -> Result<Vec<SessionSummary>, String> {
    let agent_dir = resolve_agent_dir().map_err(|error| error.to_string())?;
    let mut cache = state
        .cache
        .lock()
        .map_err(|_| "session index cache lock was poisoned".to_owned())?;

    build_index_with_cache(agent_dir, &mut cache).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_session_detail(id: String) -> Result<SessionDetail, String> {
    let agent_dir = resolve_agent_dir().map_err(|error| error.to_string())?;
    load_session_detail(agent_dir, &id).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(SessionIndexState::default())
        .invoke_handler(tauri::generate_handler![list_sessions, get_session_detail])
        .run(tauri::generate_context!())
        .expect("failed to run Pig");
}
