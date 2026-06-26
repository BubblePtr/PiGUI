use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Condvar, Mutex},
    thread,
    time::{Duration, Instant},
};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

type ResponseStore = Arc<(Mutex<HashMap<String, Value>>, Condvar)>;

const PI_RPC_EVENT: &str = "pi-rpc-event";
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct PiRpcState {
    process: Mutex<Option<PiRpcProcess>>,
}

struct PiRpcProcess {
    child: Child,
    stdin: ChildStdin,
    responses: ResponseStore,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRpcTransportStartInput {
    command: String,
    args: Vec<String>,
    cwd: String,
}

#[tauri::command]
pub fn start_pi_rpc_runtime(
    input: PiRpcTransportStartInput,
    app: AppHandle,
    state: State<'_, PiRpcState>,
) -> Result<(), String> {
    if input.command != "pi" {
        return Err("Pi RPC runtime command must be pi".to_owned());
    }

    let mut child = Command::new(&input.command)
        .args(&input.args)
        .current_dir(&input.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start Pi RPC runtime: {error}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to open Pi RPC stdin".to_owned())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to open Pi RPC stdout".to_owned())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to open Pi RPC stderr".to_owned())?;
    let responses = Arc::new((Mutex::new(HashMap::new()), Condvar::new()));

    spawn_stdout_reader(app.clone(), stdout, Arc::clone(&responses));
    spawn_stderr_reader(app, stderr);

    let mut process_slot = state
        .process
        .lock()
        .map_err(|_| "Pi RPC process lock was poisoned".to_owned())?;
    stop_process(process_slot.take());
    *process_slot = Some(PiRpcProcess {
        child,
        stdin,
        responses,
    });

    Ok(())
}

#[tauri::command]
pub fn send_pi_rpc_command(command: Value, state: State<'_, PiRpcState>) -> Result<Value, String> {
    let command_id = command
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Pi RPC command must include a string id".to_owned())?
        .to_owned();
    let encoded = serde_json::to_string(&command)
        .map_err(|error| format!("invalid Pi RPC command: {error}"))?;
    let responses = {
        let mut process_slot = state
            .process
            .lock()
            .map_err(|_| "Pi RPC process lock was poisoned".to_owned())?;
        let process = process_slot
            .as_mut()
            .ok_or_else(|| "Pi RPC runtime is not started".to_owned())?;

        writeln!(process.stdin, "{encoded}")
            .map_err(|error| format!("failed to write Pi RPC command: {error}"))?;
        process
            .stdin
            .flush()
            .map_err(|error| format!("failed to flush Pi RPC command: {error}"))?;

        Arc::clone(&process.responses)
    };

    wait_for_response(&responses, &command_id, RESPONSE_TIMEOUT)
}

#[tauri::command]
pub fn stop_pi_rpc_runtime(state: State<'_, PiRpcState>) -> Result<(), String> {
    let mut process_slot = state
        .process
        .lock()
        .map_err(|_| "Pi RPC process lock was poisoned".to_owned())?;

    stop_process(process_slot.take());

    Ok(())
}

fn spawn_stdout_reader(app: AppHandle, stdout: ChildStdout, responses: ResponseStore) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);

        for line_result in reader.lines() {
            match line_result {
                Ok(line) => handle_stdout_line(&app, &responses, line),
                Err(error) => {
                    emit_rpc_error(&app, format!("failed to read Pi RPC stdout: {error}"));
                    break;
                }
            }
        }
    });
}

fn spawn_stderr_reader(app: AppHandle, stderr: ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);

        for line_result in reader.lines() {
            match line_result {
                Ok(line) if !line.trim().is_empty() => {
                    emit_rpc_error(&app, line);
                }
                Ok(_) => {}
                Err(error) => {
                    emit_rpc_error(&app, format!("failed to read Pi RPC stderr: {error}"));
                    break;
                }
            }
        }
    });
}

fn handle_stdout_line(app: &AppHandle, responses: &ResponseStore, line: String) {
    let trimmed = line.trim();

    if trimmed.is_empty() {
        return;
    }

    let value = match serde_json::from_str::<Value>(trimmed) {
        Ok(value) => value,
        Err(_) => {
            emit_rpc_error(app, format!("Pi RPC emitted non-JSON stdout: {trimmed}"));
            return;
        }
    };

    if let Some(response_id) = response_id_from_value(&value) {
        let (lock, cvar) = &**responses;

        match lock.lock() {
            Ok(mut pending) => {
                pending.insert(response_id, value);
                cvar.notify_all();
            }
            Err(_) => emit_rpc_error(app, "Pi RPC response lock was poisoned".to_owned()),
        }

        return;
    }

    let _ = app.emit(PI_RPC_EVENT, value);
}

fn response_id_from_value(value: &Value) -> Option<String> {
    if value.get("type").and_then(Value::as_str) != Some("response") {
        return None;
    }

    value.get("id").and_then(Value::as_str).map(str::to_owned)
}

fn wait_for_response(
    responses: &ResponseStore,
    command_id: &str,
    timeout: Duration,
) -> Result<Value, String> {
    let (lock, cvar) = &**responses;
    let deadline = Instant::now() + timeout;
    let mut pending = lock
        .lock()
        .map_err(|_| "Pi RPC response lock was poisoned".to_owned())?;

    loop {
        if let Some(response) = pending.remove(command_id) {
            return Ok(response);
        }

        let now = Instant::now();

        if now >= deadline {
            return Err(format!(
                "timed out waiting for Pi RPC response {command_id}"
            ));
        }

        let remaining = deadline.saturating_duration_since(now);
        let (next_pending, wait_result) = cvar
            .wait_timeout(pending, remaining)
            .map_err(|_| "Pi RPC response lock was poisoned".to_owned())?;

        pending = next_pending;

        if wait_result.timed_out() {
            return Err(format!(
                "timed out waiting for Pi RPC response {command_id}"
            ));
        }
    }
}

fn emit_rpc_error(app: &AppHandle, message: String) {
    let _ = app.emit(
        PI_RPC_EVENT,
        json!({
            "type": "error",
            "error": message,
        }),
    );
}

fn stop_process(process: Option<PiRpcProcess>) {
    if let Some(mut process) = process {
        let _ = process.child.kill();
        let _ = process.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::response_id_from_value;

    #[test]
    fn reads_response_id_only_from_response_records() {
        assert_eq!(
            response_id_from_value(&json!({
                "type": "response",
                "id": "request-1"
            })),
            Some("request-1".to_owned())
        );
        assert_eq!(
            response_id_from_value(&json!({
                "type": "message_end",
                "id": "event-1"
            })),
            None
        );
    }
}
