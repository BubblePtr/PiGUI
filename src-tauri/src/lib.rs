pub mod sessions;

use sessions::{
    build_index, load_session_detail, resolve_agent_dir, SessionDetail, SessionSummary,
};

#[tauri::command]
fn list_sessions() -> Result<Vec<SessionSummary>, String> {
    let agent_dir = resolve_agent_dir().map_err(|error| error.to_string())?;
    build_index(agent_dir).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_session_detail(id: String) -> Result<SessionDetail, String> {
    let agent_dir = resolve_agent_dir().map_err(|error| error.to_string())?;
    load_session_detail(agent_dir, &id).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_sessions, get_session_detail])
        .run(tauri::generate_context!())
        .expect("failed to run Pig");
}
