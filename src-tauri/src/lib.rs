pub mod config;
pub mod execution_checkout;
pub mod pi_rpc;
pub mod sessions;

use std::sync::Mutex;

use config::{build_config_inventory, ConfigInventory};
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

#[tauri::command]
fn get_config_inventory() -> Result<ConfigInventory, String> {
    let agent_dir = resolve_agent_dir().map_err(|error| error.to_string())?;
    build_config_inventory(agent_dir).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(pi_rpc::PiRpcState::default())
        .manage(SessionIndexState::default())
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            get_session_detail,
            get_config_inventory,
            execution_checkout::is_git_repository,
            execution_checkout::add_detached_worktree,
            pi_rpc::start_pi_rpc_runtime,
            pi_rpc::send_pi_rpc_command,
            pi_rpc::stop_pi_rpc_runtime
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pig");
}
