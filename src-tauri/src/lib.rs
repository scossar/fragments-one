mod notes;

use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn save_note(
    title: String,
    body: String,
    database: tauri::State<'_, Mutex<rusqlite::Connection>>,
) -> Result<(), String> {
    let connection = database
        .lock()
        .map_err(|_| "Could not access the notes database. Please restart the app.".to_string())?;
    notes::save(&connection, &title, &body)
}

#[tauri::command]
fn list_note_titles(
    database: tauri::State<'_, Mutex<rusqlite::Connection>>,
) -> Result<Vec<String>, String> {
    let connection = database
        .lock()
        .map_err(|_| "Could not access the notes database. Please restart the app.".to_string())?;
    notes::list_titles(&connection).map_err(|error| {
        eprintln!("Failed to load note titles: {error}");
        "Could not load saved note titles. Please try again.".to_string()
    })
}

#[tauri::command]
fn get_note(
    title: String,
    database: tauri::State<'_, Mutex<rusqlite::Connection>>,
) -> Result<notes::Note, String> {
    let connection = database
        .lock()
        .map_err(|_| "Could not access the notes database. Please restart the app.".to_string())?;
    notes::get(&connection, &title)
}

#[tauri::command]
fn update_note(
    id: i64,
    title: String,
    body: String,
    database: tauri::State<'_, Mutex<rusqlite::Connection>>,
) -> Result<(), String> {
    let connection = database
        .lock()
        .map_err(|_| "Could not access the notes database. Please restart the app.".to_string())?;
    notes::update(&connection, id, &title, &body)
}

#[tauri::command]
fn delete_note(
    id: i64,
    database: tauri::State<'_, Mutex<rusqlite::Connection>>,
) -> Result<(), String> {
    let connection = database
        .lock()
        .map_err(|_| "Could not access the notes database. Please restart the app.".to_string())?;
    notes::delete(&connection, id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let connection = notes::open(&data_dir.join("notes.sqlite3"))?;
            app.manage(Mutex::new(connection));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_note,
            list_note_titles,
            get_note,
            update_note,
            delete_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
